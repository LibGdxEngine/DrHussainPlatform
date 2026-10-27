from datetime import date, datetime, time, timedelta

from django.db.models import Count, Prefetch
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit, audit_access
from product.tenancy import OrganizationScopedMixin, get_request_organization

from .models import Appointment, VisitKind
from .serializers import (
    AppointmentSerializer, AppointmentUpdateSerializer, AppointmentWriteSerializer, DayCountSerializer,
    VisitKindSerializer,
)

MAX_RANGE_DAYS = 62

BookedSerializer = inline_serializer('AppointmentBooked', {
    'appointment': AppointmentSerializer(),
    'form_link': serializers.CharField(allow_null=True, help_text='Set when the link could not be emailed.'),
    'form_notice': serializers.CharField(allow_blank=True),
})


def _day_bounds(day: date):
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('date', OpenApiTypes.DATE, description='One day (YYYY-MM-DD).'),
        OpenApiParameter('from', OpenApiTypes.DATE, description='First day of a range.'),
        OpenApiParameter('to', OpenApiTypes.DATE, description='Last day of a range (inclusive).'),
        OpenApiParameter('patient', OpenApiTypes.UUID, description='Only this patient\'s visits.'),
        OpenApiParameter('include_cancelled', OpenApiTypes.BOOL),
    ]),
    partial_update=extend_schema(request=AppointmentUpdateSerializer, responses={200: AppointmentSerializer}),
)
class AppointmentViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                         mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """The clinic's schedule. Reception books and checks in; visits are cancelled, never deleted."""
    queryset = Appointment.objects.select_related('patient', 'checked_in_by')
    serializer_class = AppointmentSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        from product.intake.models import IntakeForm

        queryset = super().get_queryset().prefetch_related(
            Prefetch('forms', queryset=IntakeForm.objects.order_by('-created_at'), to_attr='prefetched_forms'))
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        if params.get('patient'):
            queryset = queryset.filter(patient_id=params['patient'])
        start, end = self._range(required=not params.get('patient'))
        if start is not None:
            queryset = queryset.filter(starts_at__gte=start, starts_at__lt=end)
        if params.get('include_cancelled') not in ('true', '1'):
            queryset = queryset.exclude(status=Appointment.Status.CANCELLED)
        return queryset

    def _date(self, name):
        value = self.request.query_params.get(name, '').strip()
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValidationError({name: ['Enter a date as YYYY-MM-DD.']})

    def _range(self, *, required: bool):
        day = self._date('date')
        if day is not None:
            return _day_bounds(day)
        first, last = self._date('from'), self._date('to')
        if first is None or last is None:
            if required:
                raise ValidationError({'date': ['Choose a day, or a from/to range.']})
            return None, None
        if last < first or (last - first).days > MAX_RANGE_DAYS:
            raise ValidationError({'to': [f'Choose a range of up to {MAX_RANGE_DAYS} days.']})
        return _day_bounds(first)[0], _day_bounds(last)[1]

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('patient'):
            audit_access(request, 'appointment.listed', patient_id=request.query_params['patient'])
        return response

    @extend_schema(request=AppointmentWriteSerializer, responses={201: BookedSerializer})
    def create(self, request, *args, **kwargs):
        """Book a visit. With send_form, the patient's form link is emailed (or returned to copy)."""
        serializer = AppointmentWriteSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        send_form = serializer.validated_data.pop('send_form')
        appointment = serializer.save(organization=get_request_organization(request), created_by=request.user)
        audit(request, 'appointment.booked', appointment, patient_id=str(appointment.patient_id))
        link, notice = None, ''
        if send_form and appointment.form_kind:
            link, notice = self._send_form(request, appointment)
        appointment = self.get_queryset().get(pk=appointment.pk)
        return Response({'appointment': AppointmentSerializer(appointment).data, 'form_link': link,
                         'form_notice': notice}, status=status.HTTP_201_CREATED)

    @staticmethod
    def _send_form(request, appointment):
        from product.intake.models import IntakeForm
        from product.intake.services import NoRecipient, issue_form, link_for, send_by_email
        from product.mail.transport import MailboxNotReady

        form, token = issue_form(appointment.organization, appointment.patient, appointment.form_kind,
                                 appointment=appointment, created_by=request.user)
        audit(request, 'intake.issued', form, patient_id=str(form.patient_id))
        try:
            send_by_email(form, sent_by=request.user)
        except (NoRecipient, MailboxNotReady) as exc:
            form.sent_at, form.sent_via = timezone.now(), IntakeForm.Delivery.COPIED
            form.save(update_fields=['sent_at', 'sent_via', 'updated_at'])
            return link_for(token), str(exc)
        audit(request, 'intake.emailed', form, patient_id=str(form.patient_id))
        return None, 'The form link was emailed to the patient.'

    def perform_update(self, serializer):
        appointment = serializer.save()
        audit(self.request, 'appointment.updated', appointment, fields=sorted(serializer.validated_data))

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return AppointmentUpdateSerializer
        return AppointmentSerializer

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        super().update(request, *args, **kwargs)
        return Response(AppointmentSerializer(self.get_queryset().get(pk=kwargs['pk'])).data)

    @extend_schema(request=None, responses={200: AppointmentSerializer})
    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        appointment = self.get_object()
        if appointment.status in (Appointment.Status.CANCELLED, Appointment.Status.SEEN):
            return error_response('APPOINTMENT_CLOSED', 'This visit is closed and cannot be checked in.', status=409)
        if appointment.status != Appointment.Status.CHECKED_IN:
            appointment.status = Appointment.Status.CHECKED_IN
            appointment.checked_in_at, appointment.checked_in_by = timezone.now(), request.user
            appointment.save(update_fields=['status', 'checked_in_at', 'checked_in_by', 'updated_at'])
            audit(request, 'appointment.checked_in', appointment, patient_id=str(appointment.patient_id))
        return Response(AppointmentSerializer(self.get_queryset().get(pk=appointment.pk)).data)

    @extend_schema(parameters=[
        OpenApiParameter('from', OpenApiTypes.DATE, required=True),
        OpenApiParameter('to', OpenApiTypes.DATE, required=True),
    ], responses={200: DayCountSerializer(many=True)})
    @action(detail=False, methods=['get'], pagination_class=None)
    def days(self, request):
        """Booked visits per day, for the day picker and the week chart."""
        start, end = self._range(required=True)
        rows = (Appointment.objects.filter(organization=get_request_organization(request), starts_at__gte=start,
                                           starts_at__lt=end)
                .exclude(status=Appointment.Status.CANCELLED)
                .annotate(day=TruncDate('starts_at', tzinfo=timezone.get_current_timezone()))
                .values('day').annotate(count=Count('id')).order_by('day'))
        return Response(DayCountSerializer([{'date': r['day'], 'count': r['count']} for r in rows], many=True).data)

    @extend_schema(responses={200: VisitKindSerializer(many=True)})
    @action(detail=False, methods=['get'], pagination_class=None)
    def kinds(self, request):
        return Response([{'id': k.value, 'label': k.label, 'form_kind': Appointment(kind=k).form_kind}
                         for k in VisitKind])
