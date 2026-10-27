import uuid

from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from product.audit import audit, audit_access
from product.tenancy import IsClinicLead, OrganizationScopedMixin, get_request_organization

from .catalog import normalize_test_name
from .models import InvestigationReport, LabTest, LabTestAlias, ResultValue
from .pipeline import save_manual_values, should_read
from .serializers import (
    DocumentRefSerializer, InvestigationReportSerializer, LabTestSerializer, ManualEntrySerializer,
    ResultValueSerializer,
)
from .tasks import read_report


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('tracked', OpenApiTypes.BOOL, description='Only tests shown in the key values panel.'),
]))
class LabTestViewSet(
    OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    """The clinic's test catalog: targets, tracked tests and each lab's names. Only the doctor edits it."""
    queryset = LabTest.objects.prefetch_related('aliases')
    serializer_class = LabTestSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return super().get_permissions()
        return [IsClinicLead()]

    @transaction.atomic
    def perform_create(self, serializer):
        aliases = serializer.validated_data.pop('aliases', [])
        test = serializer.save(organization=serializer.context['organization'])
        names = set(aliases) | {normalize_test_name(test.name), normalize_test_name(test.code.replace('_', ' '))}
        self._set_aliases(test, names)
        audit(self.request, 'lab_test.created', test, code=test.code)

    @transaction.atomic
    def perform_update(self, serializer):
        aliases = serializer.validated_data.pop('aliases', None)
        test = serializer.save()
        if aliases is not None:
            self._set_aliases(test, set(aliases))
        audit(self.request, 'lab_test.updated', test, code=test.code,
              fields=sorted([*serializer.validated_data, *(['aliases'] if aliases is not None else [])]))

    @staticmethod
    def _set_aliases(test, names):
        test.aliases.exclude(alias__in=names).delete()
        existing = set(test.aliases.values_list('alias', flat=True))
        LabTestAlias.objects.bulk_create([
            LabTestAlias(lab_test=test, organization=test.organization, alias=name) for name in sorted(names - existing)
        ])

    def get_queryset(self):
        # The starting catalog is loaded when the clinic is created (product.onboarding), not here.
        queryset = super().get_queryset()
        if self.request.query_params.get('tracked') in {'1', 'true'}:
            queryset = queryset.filter(tracked=True)
        return queryset


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('patient', OpenApiTypes.UUID, description="Only this patient's reports."),
    OpenApiParameter('document', OpenApiTypes.UUID, description='The report read from this document.'),
    OpenApiParameter('status', str, description='pending, parsed, flagged or confirmed.'),
]))
class InvestigationReportViewSet(
    OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet,
):
    """What was read from each uploaded report, with every value compared to the previous one."""
    queryset = InvestigationReport.objects.select_related('document').prefetch_related('values__lab_test')
    serializer_class = InvestigationReportSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            for param, lookup in (('patient', 'patient_id'), ('document', 'document_id'), ('status', 'status')):
                if params.get(param):
                    queryset = queryset.filter(**{lookup: params[param]})
        return queryset

    def get_permissions(self):
        if self.action == 'confirm':
            return [IsClinicLead()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        report = self.get_object()
        audit(request, 'report.opened', report, patient_id=str(report.patient_id))
        return Response(self.get_serializer(report).data)

    @extend_schema(request=DocumentRefSerializer, responses={202: DocumentRefSerializer})
    @action(detail=False, methods=['post'])
    def read(self, request):
        """Queue a lab or pathology file that has never been read, e.g. one uploaded before reading existed."""
        serializer = DocumentRefSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        document = serializer.validated_data['document']
        audit(request, 'report.read_requested', document)
        transaction.on_commit(lambda: read_report.delay(str(document.pk), nonce=uuid.uuid4().hex))
        return Response({'document': document.pk}, status=status.HTTP_202_ACCEPTED)

    @extend_schema(request=None, responses={202: InvestigationReportSerializer})
    @action(detail=True, methods=['post'])
    def reread(self, request, pk=None):
        """Read the file again, e.g. after a parser for its lab was added. Typed-in values are kept."""
        report = self.get_object()
        if not should_read(report.document):
            return Response(self.get_serializer(report).data, status=status.HTTP_202_ACCEPTED)
        report.status = InvestigationReport.Status.PENDING
        report.save(update_fields=['status', 'updated_at'])
        audit(request, 'report.reread', report)
        transaction.on_commit(lambda: read_report.delay(str(report.document_id), nonce=uuid.uuid4().hex))
        return Response(self.get_serializer(report).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(request=None, responses={200: InvestigationReportSerializer})
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """The doctor confirms a flagged report belongs to this patient; its values join the history."""
        from product.review.services import route_report

        with transaction.atomic():
            # Locked for the whole step: a re-read finishing at the same moment, or a second click,
            # must not interleave with confirming and re-routing.
            report = InvestigationReport.objects.select_for_update().get(pk=self.get_object().pk)
            report.status = InvestigationReport.Status.CONFIRMED
            report.confirmed_by = request.user
            report.refresh_history_eligibility()
            report.save(update_fields=['status', 'confirmed_by', 'in_history', 'updated_at'])
            audit(request, 'report.confirmed', report, flag_reasons=report.flag_reasons)
            # With the patient settled, the review case is routed again and may now get a draft.
            route_report(report, actor=request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=report.pk)).data)


class ManualEntryView(OrganizationScopedMixin, generics.GenericAPIView):
    """Staff type key values from a report; they are stored exactly like values read from it."""
    queryset = InvestigationReport.objects.none()
    serializer_class = ManualEntrySerializer

    def get_queryset(self):
        return InvestigationReport.objects.none()

    @extend_schema(request=ManualEntrySerializer, responses={200: InvestigationReportSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        document = data['document']
        report = save_manual_values(
            document=document,
            result_date=data.get('result_date') or document.document_date,
            entries=[(entry['lab_test'], entry['value'], entry.get('unit', '')) for entry in data['values']],
            user=request.user,
        )
        audit(request, 'report.values_entered', report, tests=[entry['test'] for entry in data['values']])
        from product.alerts.services import evaluate_patient

        evaluate_patient(document.patient)
        report = InvestigationReport.objects.prefetch_related('values__lab_test').get(pk=report.pk)
        return Response(InvestigationReportSerializer(report).data)


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('patient', OpenApiTypes.UUID, required=True, description="The patient's history."),
    OpenApiParameter('test', str, description='Only this catalog test, e.g. ferritin.'),
]))
class ResultHistoryViewSet(OrganizationScopedMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """A patient's results over time, oldest first. Only reports sure to be this patient's are included."""
    queryset = ResultValue.objects.select_related('lab_test', 'report')
    serializer_class = ResultValueSerializer

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('patient'):
            audit_access(request, 'results.history_viewed', patient_id=request.query_params['patient'],
                         test=request.query_params.get('test', ''))
        return response

    def get_queryset(self):
        queryset = super().get_queryset().filter(report__in_history=True)
        params = self.request.query_params
        if self.action == 'list':
            queryset = queryset.filter(patient_id=params.get('patient')) if params.get('patient') else queryset.none()
            if params.get('test'):
                queryset = queryset.filter(lab_test__code=params['test'])
        return queryset.order_by('result_date', 'report__created_at', 'position')
