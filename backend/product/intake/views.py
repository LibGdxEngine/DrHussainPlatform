from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.services import client_ip, record_audit_log
from core.api_errors import error_response
from product.audit import audit, audit_access
from product.mail.transport import MailboxNotReady
from product.tenancy import OrganizationScopedMixin, get_request_organization

from .models import IntakeForm
from .serializers import (
    FormSaveSerializer, IntakeFormCreateSerializer, IntakeFormDetailSerializer, IntakeFormLinkSerializer,
    IntakeFormSerializer, LinkOpenedSerializer, MrsPointSerializer, PatientFormSerializer, SessionSerializer,
    TokenSerializer, VerifySerializer,
)
from .services import (
    LinkInvalid, NoRecipient, clinic_name, form_for_session, form_for_token, issue_form, link_for, rotate_link,
    save_answers, send_by_email, verify,
)

SESSION_HEADER = 'HTTP_X_INTAKE_SESSION'


def mrs_history(patient, *, exclude=None):
    forms = (IntakeForm.objects.filter(patient=patient, status=IntakeForm.Status.COMPLETE, mrs_total__isnull=False)
             .order_by('submitted_at'))
    if exclude is not None:
        forms = forms.exclude(pk=exclude.pk)
    return [{'date': f.submitted_at, 'total': f.mrs_total, **f.mrs_groups} for f in forms if f.mrs_groups]


# --- Staff ----------------------------------------------------------------------------------------

@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('patient', OpenApiTypes.UUID, description='Only this patient\'s forms.'),
        OpenApiParameter('appointment', OpenApiTypes.UUID, description='Only forms for this visit.'),
    ]),
)
class IntakeFormViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        viewsets.GenericViewSet):
    """Patient forms. Reception sends the links; answers come back from the patient's phone."""
    queryset = IntakeForm.objects.select_related('patient', 'appointment')
    serializer_class = IntakeFormSerializer

    def get_serializer_class(self):
        return IntakeFormDetailSerializer if self.action == 'retrieve' else IntakeFormSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            for name in ('patient', 'appointment'):
                if self.request.query_params.get(name):
                    queryset = queryset.filter(**{f'{name}_id': self.request.query_params[name]})
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('patient'):
            audit_access(request, 'intake.listed', patient_id=request.query_params['patient'])
        return response

    def retrieve(self, request, *args, **kwargs):
        form = self.get_object()
        audit(request, 'intake.opened', form, patient_id=str(form.patient_id))
        return Response(self.get_serializer(form).data)

    def _link_response(self, form, token, code=status.HTTP_200_OK):
        return Response({'form': IntakeFormSerializer(form).data, 'link': link_for(token)}, status=code)

    @extend_schema(request=IntakeFormCreateSerializer, responses={
        201: IntakeFormLinkSerializer, 409: OpenApiResponse(description='NO_RECIPIENT or MAILBOX_NOT_READY'),
    })
    def create(self, request, *args, **kwargs):
        """Start (or re-issue) the form for a visit or a patient. With send_email, the link is emailed too."""
        serializer = IntakeFormCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        form, token = issue_form(get_request_organization(request), data['patient'], data['kind'],
                                 appointment=data.get('appointment'), created_by=request.user,
                                 delivery='' if data['send_email'] else IntakeForm.Delivery.COPIED)
        audit(request, 'intake.issued', form, patient_id=str(form.patient_id))
        if data['send_email']:
            return self._email(request, form)
        return self._link_response(form, token, status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={200: IntakeFormLinkSerializer})
    @action(detail=True, methods=['post'])
    def link(self, request, pk=None):
        """A fresh link to send another way (for example pasted into WhatsApp). The old link stops working."""
        form = self.get_object()
        if form.status == IntakeForm.Status.COMPLETE:
            return error_response('FORM_COMPLETE', 'This form is already complete.', status=409)
        token = rotate_link(form, delivery=IntakeForm.Delivery.COPIED)
        audit(request, 'intake.link_copied', form, patient_id=str(form.patient_id))
        return self._link_response(form, token)

    @extend_schema(request=None, responses={
        200: IntakeFormLinkSerializer, 409: OpenApiResponse(description='NO_RECIPIENT or MAILBOX_NOT_READY'),
    })
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Email a fresh link from the clinic mailbox. The old link stops working."""
        form = self.get_object()
        if form.status == IntakeForm.Status.COMPLETE:
            return error_response('FORM_COMPLETE', 'This form is already complete.', status=409)
        return self._email(request, form)

    def _email(self, request, form):
        try:
            token = send_by_email(form, sent_by=request.user)
        except NoRecipient as exc:
            return error_response('NO_RECIPIENT', str(exc), status=409)
        except MailboxNotReady as exc:
            return error_response('MAILBOX_NOT_READY', str(exc), status=409)
        audit(request, 'intake.emailed', form, patient_id=str(form.patient_id))
        return self._link_response(form, token)

    @extend_schema(parameters=[OpenApiParameter('patient', OpenApiTypes.UUID, required=True)],
                   responses={200: MrsPointSerializer(many=True)})
    @action(detail=False, methods=['get'])
    def mrs(self, request):
        """The patient's Menopause Rating Scale scores over time, oldest first."""
        from product.patients.models import Patient

        patient = Patient.objects.filter(organization=get_request_organization(request),
                                         pk=request.query_params.get('patient')).first()
        if patient is None:
            return Response([])
        audit_access(request, 'intake.mrs_viewed', patient_id=patient.pk)
        return Response(MrsPointSerializer(mrs_history(patient), many=True).data)


# --- The patient's phone --------------------------------------------------------------------------

class PublicIntakeView(APIView):
    """No staff sign-in: the link's token, then the patient's date of birth, are the only keys."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'intake'

    def handle_exception(self, exc):
        if isinstance(exc, LinkInvalid):
            return error_response(exc.code, str(exc), status=status.HTTP_410_GONE)
        return super().handle_exception(exc)

    @staticmethod
    def _summary(form):
        return {
            'clinic_name': clinic_name(form.organization),
            'first_name': form.patient.full_name.split(' ')[0],
            'kind': form.kind,
            'status': form.status,
            'visit_at': form.appointment.starts_at if form.appointment else None,
        }

    def _session_form(self, request):
        return form_for_session(request.META.get(SESSION_HEADER, ''))


class IntakeOpenView(PublicIntakeView):
    @extend_schema(request=TokenSerializer, responses={200: LinkOpenedSerializer, 410: OpenApiResponse(
        description='LINK_INVALID or LINK_LOCKED')}, auth=[])
    def post(self, request):
        serializer = TokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = form_for_token(serializer.validated_data['token'])
        if form.opened_at is None:
            from django.utils import timezone

            form.opened_at = timezone.now()
            form.save(update_fields=['opened_at', 'updated_at'])
        return Response(self._summary(form))


class IntakeVerifyView(PublicIntakeView):
    @extend_schema(request=VerifySerializer, responses={200: SessionSerializer, 400: OpenApiResponse(
        description='DATE_OF_BIRTH_MISMATCH'), 410: OpenApiResponse(description='LINK_INVALID or LINK_LOCKED')},
        auth=[])
    def post(self, request):
        serializer = VerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = form_for_token(serializer.validated_data['token'])
        session = verify(form, serializer.validated_data['date_of_birth'])
        record_audit_log(
            'intake.verified' if session else 'intake.verify_failed', 'intake.intakeform',
            resource_id=form.pk, ip_address=client_ip(request),
            metadata={'organization_id': str(form.organization_id), 'patient_id': str(form.patient_id)},
        )
        if session is None:
            if form.status == IntakeForm.Status.LOCKED:
                raise LinkInvalid('LINK_LOCKED', 'This link is locked after too many tries. Ask the clinic for a new one.')
            return error_response('DATE_OF_BIRTH_MISMATCH', 'That date of birth does not match our records.')
        return Response({'session': session})


class IntakeFormView(PublicIntakeView):
    def _payload(self, form):
        from product.orders.services import current_medicines

        medicines = [' '.join(filter(None, [m.drug, m.dose])) for m in current_medicines(form.patient)]
        return {**self._summary(form), 'answers': form.answers, 'mrs': form.mrs,
                'previous_mrs': mrs_history(form.patient, exclude=form), 'current_medicines': medicines}

    @extend_schema(responses={200: PatientFormSerializer, 410: OpenApiResponse(description='SESSION_EXPIRED')},
                   parameters=[OpenApiParameter('X-Intake-Session', str, OpenApiParameter.HEADER, required=True)],
                   auth=[])
    def get(self, request):
        return Response(self._payload(self._session_form(request)))

    @extend_schema(request=FormSaveSerializer, responses={200: PatientFormSerializer},
                   parameters=[OpenApiParameter('X-Intake-Session', str, OpenApiParameter.HEADER, required=True)],
                   auth=[])
    def patch(self, request):
        """Save and finish later."""
        return self._save(request, submit=False)

    @extend_schema(request=FormSaveSerializer, responses={200: PatientFormSerializer},
                   parameters=[OpenApiParameter('X-Intake-Session', str, OpenApiParameter.HEADER, required=True)],
                   auth=[])
    def post(self, request):
        """Send the form to the doctor. It can't be changed afterwards."""
        return self._save(request, submit=True)

    def _save(self, request, *, submit):
        form = self._session_form(request)
        if form.status == IntakeForm.Status.COMPLETE:
            return error_response('FORM_COMPLETE', 'You have already sent this form to the clinic.', status=409)
        serializer = FormSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mrs = serializer.validated_data.get('mrs')
        if submit and form.kind == IntakeForm.Kind.FOLLOW_UP and mrs is None and form.mrs is None:
            return error_response('MRS_REQUIRED', 'Answer the symptom questions before sending.',
                                  fields={'mrs': ['Answer the symptom questions before sending.']})
        save_answers(form, serializer.validated_data['answers'], mrs, submit=submit)
        if submit:
            record_audit_log('intake.submitted', 'intake.intakeform', resource_id=form.pk, ip_address=client_ip(request),
                             metadata={'organization_id': str(form.organization_id), 'patient_id': str(form.patient_id)})
        return Response(self._payload(form))
