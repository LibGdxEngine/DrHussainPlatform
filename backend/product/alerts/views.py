from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.tenancy import IsClinicLead, OrganizationScopedMixin

from .models import PatientAlert
from .serializers import AcknowledgeSerializer, PatientAlertSerializer
from .services import acknowledge


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('patient', OpenApiTypes.UUID, description="Only this patient's alerts."),
    OpenApiParameter('report', OpenApiTypes.UUID, description='Only alerts fired by this report.'),
    OpenApiParameter('status', str, description='open (default), acknowledged, resolved or all.'),
]))
class PatientAlertViewSet(OrganizationScopedMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Alert rules that fired on patients' results. The doctor acknowledges each with a reason."""
    queryset = PatientAlert.objects.select_related('rule', 'rule_version', 'value', 'examination', 'acknowledged_by',
                                                   'patient')
    serializer_class = PatientAlertSerializer

    def get_permissions(self):
        return [IsClinicLead()] if self.action == 'acknowledge' else super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            wanted = params.get('status', 'open')
            if wanted != 'all':
                queryset = queryset.filter(status=wanted)
            for name in ('patient', 'report'):
                if params.get(name):
                    queryset = queryset.filter(**{f'{name}_id': params[name]})
        return queryset

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
            if alert.report_id and hasattr(alert.report, 'case'):
                # A red alert held the case back; with it acknowledged the case is routed again.
                from product.review.services import route_report

                route_report(alert.report, actor=request.user)
        return Response(PatientAlertSerializer(alert).data)
