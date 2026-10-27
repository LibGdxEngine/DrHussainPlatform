from django.db.models import Count, Prefetch
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit, audit_access
from product.mail.transport import MailboxNotReady
from product.tenancy import IsClinicLead, IsOrganizationMember, OrganizationScopedMixin, get_request_organization

from .models import Order, RequestedTest
from .serializers import (
    OrderCreateSerializer, OrderSerializer, PendingCountSerializer, RequestedTestSerializer,
    RequestedTestUpdateSerializer,
)
from .services import issue_order


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('patient', OpenApiTypes.UUID, required=True, description='The patient whose orders to list.'),
    OpenApiParameter('kind', str, description='tests or prescription.'),
]))
class OrderViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   viewsets.GenericViewSet):
    """Lab requests and prescriptions. Only the doctor issues them; orders are never edited afterwards."""
    queryset = Order.objects.select_related('issued_by', 'mail_message').prefetch_related(
        Prefetch('tests', queryset=RequestedTest.objects.select_related('order', 'patient')), 'medicines')
    serializer_class = OrderSerializer

    def get_permissions(self):
        return [IsClinicLead()] if self.action == 'create' else [IsOrganizationMember()]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            queryset = queryset.filter(patient_id=self.request.query_params.get('patient') or None)
            if self.request.query_params.get('kind'):
                queryset = queryset.filter(kind=self.request.query_params['kind'])
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        audit_access(request, 'order.listed', patient_id=request.query_params.get('patient'))
        return response

    @extend_schema(request=OrderCreateSerializer, responses={
        201: OrderSerializer, 409: OpenApiResponse(description='MAILBOX_NOT_READY')})
    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        try:
            order = issue_order(get_request_organization(request), issued_by=request.user,
                                **serializer.validated_data)
        except MailboxNotReady as exc:
            return error_response('MAILBOX_NOT_READY', str(exc), status=409)
        audit(request, 'order.issued', order, patient_id=str(order.patient_id), kind=order.kind,
              delivery=order.delivery)
        return Response(OrderSerializer(self.get_queryset().get(pk=order.pk)).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('patient', OpenApiTypes.UUID, description='Only this patient\'s requested tests.'),
        OpenApiParameter('status', str, description='pending, clinic, email or entered.'),
    ]),
    partial_update=extend_schema(request=RequestedTestUpdateSerializer, responses={200: RequestedTestSerializer}),
)
class RequestedTestViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.UpdateModelMixin,
                           viewsets.GenericViewSet):
    """Tests the patient should bring. Reception marks them as they arrive."""
    queryset = RequestedTest.objects.select_related('order', 'patient')
    serializer_class = RequestedTestSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return RequestedTestUpdateSerializer if self.action == 'partial_update' else RequestedTestSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            if params.get('patient'):
                queryset = queryset.filter(patient_id=params['patient'])
            if params.get('status'):
                queryset = queryset.filter(status=params['status'])
            if not params.get('patient'):
                queryset = queryset[:500]
        return queryset

    def perform_update(self, serializer):
        before = serializer.instance.status
        test = serializer.save()
        if test.status != before:
            test.arrived_at = None if test.status == RequestedTest.Status.PENDING else (test.arrived_at or timezone.now())
            test.save(update_fields=['arrived_at', 'updated_at'])
        audit(self.request, 'requested_test.updated', test, patient_id=str(test.patient_id), status=test.status)

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        super().update(request, *args, **kwargs)
        return Response(RequestedTestSerializer(self.get_queryset().get(pk=kwargs['pk'])).data)

    @extend_schema(responses={200: PendingCountSerializer})
    @action(detail=False, methods=['get'])
    def counts(self, request):
        pending = RequestedTest.objects.filter(organization=get_request_organization(request),
                                               status=RequestedTest.Status.PENDING)
        totals = pending.aggregate(pending=Count('id'), patients=Count('patient', distinct=True))
        return Response(totals)
