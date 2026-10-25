from django.db.models import Count, Prefetch
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.content.models import EmailTemplate
from product.tenancy import IsClinicLead, IsOrganizationMember, OrganizationScopedMixin

from .models import Draft, ResultsCase
from .serializers import (
    DraftEditSerializer, DraftOptionsSerializer, PlanRequestSerializer, ReasonSerializer, ResultsCaseDetailSerializer,
    ResultsCaseSerializer,
)
from .services import (
    SMEAR_PLAN_KEYS, ReviewError, approve_and_send, choose_plan, edit_draft, rebuild, reject,
)

# Queue filters as staff think of them.
STATUS_GROUPS = {
    'needs_doctor': [ResultsCase.Status.FLAGGED, ResultsCase.Status.AWAITING_PLAN],
    'ready': [ResultsCase.Status.DRAFTED],
    'sent': [ResultsCase.Status.SENDING, ResultsCase.Status.SENT],
    'rejected': [ResultsCase.Status.REJECTED],
}


class QueueCountsSerializer(serializers.Serializer):
    needs_doctor = serializers.IntegerField()
    ready = serializers.IntegerField()
    sent = serializers.IntegerField()
    rejected = serializers.IntegerField()


def _current_versions(items):
    return [item.current for item in items if item.current is not None]


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('group', str, description='needs_doctor, ready, sent or rejected.'),
    OpenApiParameter('patient', str, description="Only this patient's cases (id)."),
]))
class ResultsCaseViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                         viewsets.GenericViewSet):
    """
    The review queue. Each case shows the report, the values read from it and the draft. Every
    action below is the doctor's, logged with its time; approving is the only way an email is sent.
    """
    queryset = ResultsCase.objects.select_related('patient', 'report__document', 'plan_template')
    serializer_class = ResultsCaseSerializer

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsOrganizationMember()]
        return [IsClinicLead()]

    def get_serializer_class(self):
        return ResultsCaseSerializer if self.action in {'list', 'counts'} else ResultsCaseDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            if params.get('group') in STATUS_GROUPS:
                queryset = queryset.filter(status__in=STATUS_GROUPS[params['group']])
            if params.get('patient'):
                queryset = queryset.filter(patient_id=params['patient'])
        elif self.action != 'counts':
            queryset = queryset.prefetch_related(
                'report__values__lab_test', 'actions__actor', 'sent_emails__approved_by',
                Prefetch('drafts', queryset=Draft.objects.prefetch_related(
                    'template_versions__template', 'prescriptions', 'leaflets__leaflet')),
            )
        return queryset

    def _detail(self, case, status=200):
        case = self.get_queryset().get(pk=case.pk)
        context = self.get_serializer_context()
        if case.report.report_type == 'smear_abnormal':
            templates = EmailTemplate.objects.filter(organization=case.organization, key__in=SMEAR_PLAN_KEYS,
                                                     language='en', archived=False)
            context['smear_plans'] = [
                {'key': t.key, 'name': t.name, 'approved': t.approved is not None}
                for t in sorted(templates, key=lambda t: SMEAR_PLAN_KEYS.index(t.key))
            ]
        return Response(ResultsCaseDetailSerializer(case, context=context).data, status=status)

    def retrieve(self, request, *args, **kwargs):
        case = self.get_object()
        audit(request, 'review_case.opened', case, patient_id=str(case.patient_id))
        return self._detail(case)

    def _run(self, request, name, work, **audit_details):
        case = self.get_object()
        try:
            work(case)
        except ReviewError as error:
            return error_response(error.code, error.message, status=error.status)
        audit(request, f'review_case.{name}', case, **audit_details)
        return self._detail(case)

    @extend_schema(responses={200: QueueCountsSerializer})
    @action(detail=False, methods=['get'])
    def counts(self, request):
        """How many cases are in each queue, for the sidebar badge."""
        totals = dict(self.get_queryset().values_list('status').annotate(n=Count('id')))
        return Response({group: sum(totals.get(s, 0) for s in statuses) for group, statuses in STATUS_GROUPS.items()})

    @extend_schema(request=PlanRequestSerializer, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['post'])
    def plan(self, request, pk=None):
        """Abnormal smear: the doctor picks the plan (a smear section), then the draft is built."""
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data['template']

        def work(case):
            template = EmailTemplate.objects.filter(organization=case.organization, key=key, language='en').first()
            if template is None:
                raise ReviewError('invalid_plan', 'Choose one of the cervical smear sections 2 to 14.')
            choose_plan(case, template, user=request.user)

        return self._run(request, 'plan_chosen', work, template=key)

    @extend_schema(request=DraftOptionsSerializer, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['post'])
    def options(self, request, pk=None):
        """Choose the prescription, follow-up, language or attachments; the draft is rebuilt."""
        serializer = DraftOptionsSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        def work(case):
            rebuild(
                case, user=request.user, language=data.get('language'), follow_up=data.get('follow_up'),
                attach_report=data.get('attach_report'),
                prescriptions=_current_versions(data['prescriptions']) if 'prescriptions' in data else None,
                leaflets=_current_versions(data['leaflets']) if 'leaflets' in data else None,
            )

        return self._run(request, 'options_chosen', work, fields=sorted(data))

    @extend_schema(request=DraftEditSerializer, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['patch'])
    def draft(self, request, pk=None):
        """The doctor's edits to the wording or attachments. A blank left open blocks sending."""
        serializer = DraftEditSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        def work(case):
            edit_draft(case, user=request.user, subject=data.get('subject'), body=data.get('body'),
                       attach_report=data.get('attach_report'),
                       leaflets=_current_versions(data['leaflets']) if 'leaflets' in data else None)

        return self._run(request, 'edited', work, fields=sorted(data))

    @extend_schema(request=ReasonSerializer, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['post'], url_path='draft-anyway')
    def draft_anyway(self, request, pk=None):
        """The doctor has looked at a flagged report and wants a draft anyway. Abnormal smears still need a plan."""
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        def work(case):
            if case.status != ResultsCase.Status.FLAGGED:
                raise ReviewError('not_flagged', 'Only a flagged case can be drafted anyway.', status=409)
            from .models import ReviewAction

            ReviewAction.objects.create(case=case, action=ReviewAction.Action.DRAFTED_ANYWAY, actor=request.user,
                                        details={'reason': serializer.validated_data['reason'],
                                                 'flags': case.flag_reasons})
            rebuild(case, user=request.user, ignore_flags=True)

        return self._run(request, 'drafted_anyway', work, reason=serializer.validated_data['reason'])

    @extend_schema(request=None, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve and send the current draft to the patient. The only route out of the clinic."""
        return self._run(request, 'approved', lambda case: approve_and_send(case, user=request.user))

    @extend_schema(request=ReasonSerializer, responses={200: ResultsCaseDetailSerializer})
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']
        return self._run(request, 'rejected', lambda case: reject(case, user=request.user, reason=reason),
                         reason=reason)
