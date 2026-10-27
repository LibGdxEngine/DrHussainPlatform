"""The clinic's audit log: who signed in, opened, changed, sent or was refused what, and when."""
from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import generics, serializers

from apps.audit.models import AuditLog
from apps.common.pagination import StandardResultsSetPagination
from apps.organizations.models import OrganizationMember
from product.patients.models import Patient
from product.tenancy import IsClinicLead, get_request_organization

# Filters as the audit screen offers them.
ACTION_GROUPS = {
    'signin': Q(action__startswith='auth.'),
    'view': Q(action__endswith='.opened') | Q(action__endswith='.listed') | Q(action__endswith='.searched')
    | Q(action__endswith='.history_viewed'),
    'edit': Q(action__endswith='.created') | Q(action__endswith='.updated') | Q(action__endswith='.values_entered')
    | Q(action__endswith='.edited') | Q(action__endswith='.linked') | Q(action__endswith='.saved')
    | Q(action__endswith='.confirmed') | Q(action__endswith='.uploaded') | Q(action__endswith='.version_saved'),
    'send': Q(action__in=['review_case.approved', 'mail_thread.replied']),
    'alert': Q(action__startswith='patient_alert.'),
    'denied': Q(action__in=['access.denied', 'auth.signin_failed', 'auth.signin_blocked']),
}
_DENIED = {'access.denied', 'auth.signin_failed', 'auth.signin_blocked'}
# Metadata worth showing; anything else stays in the record but off the screen.
_SHOWN = ('query', 'results', 'count', 'slot', 'fields', 'reason', 'code', 'tests', 'template', 'method', 'path',
          'identifier', 'number', 'version', 'flag_reasons', 'test')


class ActivityPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_number = serializers.CharField()
    full_name = serializers.CharField()


class ActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()
    patient = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    outcome = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ['id', 'created_at', 'actor_name', 'actor_role', 'action', 'resource_type', 'resource_id', 'patient',
                  'details', 'outcome', 'ip_address']

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return obj.metadata.get('identifier', '') or 'Unknown'
        return obj.actor.get_full_name() or obj.actor.email

    def get_actor_role(self, obj) -> str:
        return self.context['roles'].get(obj.actor_id, '')

    @extend_schema_field(ActivityPatientSerializer(allow_null=True))
    def get_patient(self, obj):
        patient_id = obj.metadata.get('patient_id') or (obj.resource_id if obj.resource_type == 'patients.patient' else '')
        patient = self.context['patients'].get(str(patient_id)) if patient_id else None
        return ActivityPatientSerializer(patient).data if patient else None

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_details(self, obj):
        return {k: obj.metadata[k] for k in _SHOWN if k in obj.metadata}

    def get_outcome(self, obj) -> str:
        return 'denied' if obj.action in _DENIED else 'success'


def _day(value: str, end: bool):
    try:
        day = datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(datetime.combine(day, time.max if end else time.min))


class ActivityView(generics.ListAPIView):
    """
    The clinic's audit log, newest first. Rows cannot be edited or deleted from the platform;
    clinical values and note text are never written to it.
    """
    permission_classes = [IsClinicLead]
    serializer_class = ActivitySerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AuditLog.objects.none()
        organization = get_request_organization(self.request)
        members = OrganizationMember.objects.filter(organization=organization).select_related('user')
        self._roles = {m.user_id: m.get_role_display() for m in members}
        identifiers = {v for m in members for v in (m.user.email, m.user.phone) if v}
        queryset = AuditLog.objects.filter(
            Q(metadata__organization_id=str(organization.pk))
            | Q(action__startswith='auth.', actor_id__in=self._roles)
            | Q(action__startswith='auth.', resource_id__in=[str(pk) for pk in self._roles])
            | Q(action='auth.signin_failed', metadata__identifier__in=identifiers)
        ).select_related('actor').order_by('-created_at')
        params = self.request.query_params
        if params.get('group') in ACTION_GROUPS:
            queryset = queryset.filter(ACTION_GROUPS[params['group']])
        if params.get('actor'):
            queryset = queryset.filter(actor_id=params['actor'])
        since, until = _day(params.get('since'), False), _day(params.get('until'), True)
        if since:
            queryset = queryset.filter(created_at__gte=since)
        if until:
            queryset = queryset.filter(created_at__lte=until)
        if params.get('patient'):
            patient = Patient.objects.filter(organization=organization, file_number=params['patient'].upper()).first()
            patient_id = str(patient.pk) if patient else '-'
            queryset = queryset.filter(Q(metadata__patient_id=patient_id) | Q(resource_id=patient_id))
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['roles'] = getattr(self, '_roles', {})
        context['patients'] = getattr(self, '_patients', {})
        return context

    def paginate_queryset(self, queryset):
        page = super().paginate_queryset(queryset)
        if page is not None and not getattr(self, 'swagger_fake_view', False):
            ids = {str(r.metadata.get('patient_id') or (r.resource_id if r.resource_type == 'patients.patient' else ''))
                   for r in page} - {''}
            organization = get_request_organization(self.request)
            self._patients = {str(p.pk): p for p in Patient.objects.filter(organization=organization, pk__in=ids)}
        return page

    @extend_schema(parameters=[
        OpenApiParameter('group', str, description='signin, view, edit, send, alert or denied.'),
        OpenApiParameter('actor', OpenApiTypes.UUID, description='Only this user.'),
        OpenApiParameter('patient', str, description='Only this file number, e.g. VC-000142.'),
        OpenApiParameter('since', OpenApiTypes.DATE, description='From this day.'),
        OpenApiParameter('until', OpenApiTypes.DATE, description='Up to and including this day.'),
    ])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ActivityMemberSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    role = serializers.CharField()


class ActivityMembersView(generics.GenericAPIView):
    """The clinic's users, for the audit log's user filter."""
    permission_classes = [IsClinicLead]
    serializer_class = ActivityMemberSerializer

    @extend_schema(responses={200: ActivityMemberSerializer(many=True)})
    def get(self, request):
        from rest_framework.response import Response

        members = OrganizationMember.objects.filter(organization=get_request_organization(request)).select_related('user')
        return Response([
            {'id': m.user_id, 'name': m.user.get_full_name() or m.user.email, 'role': m.get_role_display()}
            for m in members
        ])
