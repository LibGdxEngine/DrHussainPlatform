import smtplib
import uuid

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.records.models import DocumentSource
from product.records.services import UploadRejected, store_document
from product.results.pipeline import schedule_reading
from product.tenancy import IsClinicLead, IsOrganizationMember, OrganizationScopedMixin, get_request_organization

from .models import MailAttachment, MailMessage, MailThread, Mailbox
from .serializers import (
    ConnectionCheckSerializer, InboxCountsSerializer, LinkPatientSerializer, MailAttachmentSerializer,
    MailboxSerializer, MailThreadDetailSerializer, MailThreadSerializer, ReplySerializer, SaveAttachmentSerializer,
    ThreadUpdateSerializer,
)
from .services import reply_headers
from .tasks import poll_mailbox, send_thread_reply
from .transport import MailboxNotReady, imap_connection, outgoing, smtp_connection


def _lead_for_writes(request):
    return [IsOrganizationMember()] if request.method in permissions.SAFE_METHODS else [IsClinicLead()]


class MailboxView(generics.RetrieveUpdateAPIView):
    """The clinic's mail server settings. Only the doctor changes them; passwords are never returned."""
    serializer_class = MailboxSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_permissions(self):
        return _lead_for_writes(self.request)

    def get_object(self):
        organization = get_request_organization(self.request)
        mailbox, _ = Mailbox.objects.get_or_create(organization=organization, defaults={'address': ''})
        return mailbox

    def perform_update(self, serializer):
        mailbox = serializer.save()
        audit(self.request, 'mailbox.updated', mailbox, fields=sorted(serializer.validated_data))


def _check(run) -> str:
    try:
        run()
        return 'ok'
    except Exception as exc:  # noqa: BLE001 - reported to the doctor as text
        return f'{type(exc).__name__}: {exc}'[:255]


class MailboxCheckView(generics.GenericAPIView):
    permission_classes = [IsClinicLead]
    serializer_class = ConnectionCheckSerializer

    @extend_schema(request=None, responses={200: ConnectionCheckSerializer})
    def post(self, request):
        """Try to log in to the SMTP and IMAP servers with the saved settings."""
        mailbox = Mailbox.objects.filter(organization=get_request_organization(request)).first()
        if mailbox is None or not mailbox.smtp_host:
            smtp_result = 'Not set up'
        else:
            def smtp():
                connection = smtp_connection(mailbox)
                connection.open()
                connection.close()
            smtp_result = _check(smtp)
        if mailbox is None or not mailbox.imap_host:
            imap_result = 'Not set up'
        else:
            imap_result = _check(lambda: imap_connection(mailbox).logout())
        return Response({'smtp': smtp_result, 'imap': imap_result})


class MailboxSyncView(generics.GenericAPIView):
    permission_classes = [IsOrganizationMember]
    serializer_class = MailboxSerializer

    @extend_schema(request=None, responses={202: None})
    def post(self, request):
        """Check the mailbox for new mail now instead of waiting for the next scheduled check."""
        mailbox = Mailbox.objects.filter(organization=get_request_organization(request)).first()
        if mailbox is None or not mailbox.can_receive:
            return error_response('mailbox_not_set_up', 'Set up the clinic mailbox first.', status=409)
        poll_mailbox.delay(str(mailbox.pk))
        return Response(status=status.HTTP_202_ACCEPTED)


@extend_schema_view(list=extend_schema(parameters=[
    OpenApiParameter('folder', str, description='inbox (default), sent or archive.'),
    OpenApiParameter('filter', str, description='unread, patients or unmatched.'),
    OpenApiParameter('q', str, description='Search sender, subject, patient name or file number.'),
    OpenApiParameter('patient', OpenApiTypes.UUID, description="Only this patient's emails."),
]))
class MailThreadViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        viewsets.GenericViewSet):
    """The clinic mailbox as threads: each sent email and every reply to it stay together."""
    queryset = MailThread.objects.select_related('patient', 'suggested_patient')
    serializer_class = MailThreadSerializer

    def get_permissions(self):
        if self.action == 'reply':
            return [IsClinicLead()]
        return [IsOrganizationMember()]

    def get_serializer_class(self):
        return MailThreadSerializer if self.action in {'list', 'counts'} else MailThreadDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != 'list':
            return queryset.prefetch_related('messages__attachments', 'messages__sent_by')
        params = self.request.query_params
        folder = params.get('folder', 'inbox')
        if folder == 'archive':
            queryset = queryset.filter(archived=True)
        elif folder == 'sent':
            queryset = queryset.filter(has_outbound=True, archived=False)
        else:
            queryset = queryset.filter(has_inbound=True, archived=False)
        flt = params.get('filter')
        if flt == 'unread':
            queryset = queryset.filter(unread=True)
        elif flt == 'patients':
            queryset = queryset.filter(patient__isnull=False)
        elif flt == 'unmatched':
            queryset = queryset.filter(patient__isnull=True)
        if params.get('patient'):
            queryset = queryset.filter(patient_id=params['patient'])
        query = params.get('q', '').strip()
        if query:
            queryset = queryset.filter(
                Q(subject__icontains=query) | Q(contact_email__icontains=query) | Q(contact_name__icontains=query)
                | Q(patient__full_name__icontains=query) | Q(patient__file_number__icontains=query)
            )
        return queryset

    def retrieve(self, request, *args, **kwargs):
        """Opening a thread marks it read."""
        thread = self.get_object()
        if thread.unread:
            MailThread.objects.filter(pk=thread.pk).update(unread=False)
            thread.unread = False
        audit(request, 'mail_thread.opened', thread, patient_id=str(thread.patient_id or ''))
        return Response(MailThreadDetailSerializer(thread).data)

    def _detail(self, thread):
        return Response(MailThreadDetailSerializer(self.get_queryset().get(pk=thread.pk)).data)

    @extend_schema(responses={200: InboxCountsSerializer})
    @action(detail=False, methods=['get'])
    def counts(self, request):
        inbox = self.get_queryset().filter(has_inbound=True, archived=False)
        return Response({'unread': inbox.filter(unread=True).count(), 'unmatched': inbox.filter(patient__isnull=True).count()})

    @extend_schema(request=ThreadUpdateSerializer, responses={200: MailThreadDetailSerializer})
    @action(detail=True, methods=['patch'])
    def state(self, request, pk=None):
        """Mark read or unread, archive or restore."""
        thread = self.get_object()
        serializer = ThreadUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        MailThread.objects.filter(pk=thread.pk).update(**serializer.validated_data)
        return self._detail(thread)

    @extend_schema(request=LinkPatientSerializer, responses={200: MailThreadDetailSerializer})
    @action(detail=True, methods=['post'])
    def link(self, request, pk=None):
        """File the thread in a patient's record (or unlink it with null)."""
        thread = self.get_object()
        serializer = LinkPatientSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        patient = serializer.validated_data['patient']
        MailThread.objects.filter(pk=thread.pk).update(patient=patient, suggested_patient=None)
        audit(request, 'mail_thread.linked', thread, patient_id=str(patient.pk) if patient else '')
        return self._detail(thread)

    @extend_schema(request=ReplySerializer, responses={201: MailThreadDetailSerializer})
    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        """
        The doctor writes back in a thread. Results emails go through the review queue instead; this
        is for everyday correspondence such as asking a patient to send their old files.
        """
        thread = self.get_object()
        serializer = ReplySerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        organization = get_request_organization(request)
        try:
            _, from_email = outgoing(organization)
        except MailboxNotReady as exc:
            return error_response('mailbox_not_set_up', str(exc), status=409)
        to_address = thread.contact_email or (thread.patient.email if thread.patient else '')
        if not to_address:
            return error_response('no_recipient', 'This thread has no address to reply to.')
        documents = serializer.validated_data.get('documents', [])
        if documents and (thread.patient is None or any(d.patient_id != thread.patient_id for d in documents)):
            return error_response('validation_error', 'Only documents from this patient\'s file can be attached.',
                                  fields={'documents': ["Only documents from this patient's file can be attached."]})
        in_reply_to, references = reply_headers(thread)
        domain = from_email.rpartition('@')[2].strip('>') or 'localhost'
        subject = thread.subject if thread.subject.lower().startswith('re:') else f'Re: {thread.subject}'.strip()
        with transaction.atomic():
            message = MailMessage.objects.create(
                organization=organization, thread=thread, direction=MailMessage.Direction.OUTBOUND,
                status=MailMessage.Status.QUEUED, message_id=f'<{uuid.uuid4().hex}@{domain}>', in_reply_to=in_reply_to,
                references=references, from_address=from_email, to_addresses=[to_address], subject=subject[:998],
                body_text=serializer.validated_data['body'], sent_at=timezone.now(), sent_by=request.user,
                attachment_names=[d.original_filename for d in documents],
            )
            message.attached_documents.set(documents)
            transaction.on_commit(lambda: send_thread_reply.delay(str(message.pk)))
        audit(request, 'mail_thread.replied', thread, message=str(message.pk))
        return Response(MailThreadDetailSerializer(self.get_queryset().get(pk=thread.pk)).data,
                        status=status.HTTP_201_CREATED)


class MailAttachmentViewSet(OrganizationScopedMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = MailAttachment.objects.select_related('message__thread__patient')
    serializer_class = MailAttachmentSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MailAttachment.objects.none()
        return self.queryset.filter(message__organization=get_request_organization(self.request))

    @extend_schema(responses={(200, 'application/octet-stream'): OpenApiTypes.BINARY})
    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        attachment = self.get_object()
        audit(request, 'mail_attachment.opened', attachment)
        # Always a download: the sender chose the content type, so an HTML or SVG attachment must never
        # render on the API origin.
        response = FileResponse(attachment.file.open('rb'), content_type=attachment.content_type,
                                filename=attachment.filename, as_attachment=True)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @extend_schema(request=SaveAttachmentSerializer, responses={201: MailAttachmentSerializer})
    @action(detail=True, methods=['post'])
    def save(self, request, pk=None):
        """File an emailed attachment into the patient's documents; lab reports are then read automatically."""
        attachment = self.get_object()
        patient = attachment.message.thread.patient
        if patient is None:
            return error_response('not_linked', 'Link this email to a patient first.', status=409)
        if attachment.saved_document_id:
            return error_response('already_saved', 'This attachment is already in the patient\'s file.', status=409)
        serializer = SaveAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with attachment.file.open('rb') as handle:
                from django.core.files.uploadedfile import SimpleUploadedFile

                upload = SimpleUploadedFile(attachment.filename, handle.read(), content_type=attachment.content_type)
            document = store_document(
                organization=patient.organization, patient=patient, upload=upload, uploaded_by=request.user,
                slot=serializer.validated_data['slot'], title=serializer.validated_data.get('title', ''),
                source=DocumentSource.EMAIL,
            )
        except UploadRejected as rejected:
            return error_response(rejected.code, rejected.message, status=409 if rejected.code == 'DUPLICATE_DOCUMENT' else 415)
        except IntegrityError:
            return error_response('DUPLICATE_DOCUMENT', 'This file is already in the record.', status=409)
        attachment.saved_document = document
        attachment.save(update_fields=['saved_document', 'updated_at'])
        audit(request, 'mail_attachment.saved', attachment, document=str(document.pk))
        schedule_reading(document)
        return Response(MailAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)
