from django.db import transaction
from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.content.models import AlertLevel
from product.results.models import InvestigationReport
from product.tenancy import IsClinicLead, OrganizationScopedMixin, get_request_organization

from .models import PatientAlert
from .serializers import AcknowledgeSerializer, EvaluateSerializer, PatientAlertSerializer
from .services import acknowledge, evaluate_patient_safely


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('patient', OpenApiTypes.UUID, description="Only this patient's alerts."),
    OpenApiParameter('report', OpenApiTypes.UUID, description='Only alerts fired by this report.'),
    OpenApiParameter('status', str, description='open (default), acknowledged, resolved or all.'),
    OpenApiParameter('scope', str, description='case (with report): the alerts fired by this report plus the '
                                               "patient's open red answer alerts; no reminders."),
]))
class PatientAlertViewSet(OrganizationScopedMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Alert rules that fired on patients' results. The doctor acknowledges each with a reason."""
    queryset = PatientAlert.objects.select_related('rule', 'rule_version', 'value', 'examination', 'acknowledged_by',
                                                   'patient')
    serializer_class = PatientAlertSerializer

    def get_permissions(self):
        return [IsClinicLead()] if self.action in ('acknowledge', 'evaluate') else super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        wanted = params.get('status', 'open')
        by_status = Q() if wanted == 'all' else Q(status=wanted)
        if params.get('patient'):
            queryset = queryset.filter(patient_id=params['patient'])
        if params.get('report') and params.get('scope') == 'case':
            # One results case: what this report fired (not a newer report, not "never measured"),
            # plus the patient's open red answers, which the doctor must see before replying.
            report = InvestigationReport.objects.filter(
                organization=get_request_organization(self.request), pk=params['report']).first()
            if report is None:
                return queryset.none()
            red_answers = Q(patient_id=report.patient_id, intake_form__isnull=False, level=AlertLevel.RED,
                            status=PatientAlert.Status.OPEN)
            return queryset.filter((Q(report=report) & by_status) | red_answers).exclude(level=AlertLevel.REMINDER)
        queryset = queryset.filter(by_status)
        if params.get('report'):
            queryset = queryset.filter(report_id=params['report'])
        return queryset

    @extend_schema(request=EvaluateSerializer, responses={200: PatientAlertSerializer(many=True)})
    @action(detail=False, methods=['post'], pagination_class=None)
    def evaluate(self, request):
        """Check alerts now: run every rule for the patient and return her open alerts."""
        serializer = EvaluateSerializer(data=request.data, context={'organization': get_request_organization(request)})
        serializer.is_valid(raise_exception=True)
        patient = serializer.validated_data['patient']
        evaluate_patient_safely(patient)
        audit(request, 'patient_alerts.evaluated', patient, patient_id=str(patient.pk))
        alerts = self.get_queryset().filter(patient=patient, status=PatientAlert.Status.OPEN)
        return Response(PatientAlertSerializer(alerts, many=True).data)

    @extend_schema(request=AcknowledgeSerializer, responses={200: PatientAlertSerializer})
    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        serializer = AcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            # Locked: a result being read at the same moment must not resolve or reopen this alert
            # half-way through acknowledging it.
            alert = self.get_queryset().select_for_update(of=('self',)).get(pk=self.get_object().pk)
            if alert.status != PatientAlert.Status.OPEN:
                return error_response('not_open', 'This alert is already closed.', status=409)
            acknowledge(alert, user=request.user, reason=serializer.validated_data['reason'])
            audit(request, 'patient_alert.acknowledged', alert, code=alert.rule.code,
                  patient_id=str(alert.patient_id))
            from product.review.services import reroute_open_cases

            # The alert may have held this report's case or (an answer alert) every open case of the
            # patient; each is routed again, and a draft kept while it was held comes back unchanged.
            reroute_open_cases(alert.patient, actor=request.user)
        return Response(PatientAlertSerializer(alert).data)
