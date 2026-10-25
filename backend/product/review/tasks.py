import logging
from email.utils import parseaddr

from celery import shared_task
from django.core.mail import EmailMessage
from django.core.mail.message import make_msgid
from django.utils import timezone

from apps.common.tasks import BaseTask, idempotent
from apps.notifications.tasks.email import EMAIL_RETRYABLE_EXCEPTIONS

logger = logging.getLogger(__name__)


class SendCaseEmailTask(BaseTask):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Retries ran out (or the error was never retryable): the case must not stay in SENDING."""
        from .models import SentEmail

        sent = SentEmail.objects.filter(pk=(args or [kwargs.get('sent_email_id')])[0]).first()
        if sent is not None and sent.status != SentEmail.Status.SENT:
            _failed(sent, type(exc).__name__, str(exc)[:255])
        super().on_failure(exc, task_id, args, kwargs, einfo)


@shared_task(bind=True, base=SendCaseEmailTask, name='product.review.tasks.send_case_email',
             autoretry_for=EMAIL_RETRYABLE_EXCEPTIONS)
def send_case_email(self, sent_email_id: str):
    """
    Deliver an email the doctor approved. Only `approve_and_send` queues this task. Keyed on the
    sent-email record, so a redelivered message never emails the patient twice.
    """
    from .models import ResultsCase, ReviewAction, SentEmail

    sent = SentEmail.objects.select_related('case', 'draft', 'case__report__document').get(pk=sent_email_id)
    if sent.status == SentEmail.Status.SENT:
        return sent.message_id

    key = self.idempotency_key(sent_email_id)
    with idempotent(key, task_name=self.name, task_id=self.request.id) as guard:
        if guard.is_duplicate:
            return guard.result
        from product.mail.services import record_outgoing, reply_headers
        from product.mail.transport import MailboxNotReady, outgoing

        case = sent.case
        try:
            # Out through the clinic's own mail server, never an outside email service.
            connection, from_email = outgoing(case.organization)
        except MailboxNotReady as exc:
            return _failed(sent, 'MailboxNotReady', str(exc))
        # Set the Message-ID ourselves: the patient's reply is matched to this thread by it. It is
        # saved before sending so a retry after a partial failure reuses it instead of minting a new one.
        if not sent.message_id:
            sent.message_id = make_msgid(domain=parseaddr(from_email)[1].rpartition('@')[2] or None)
            sent.save(update_fields=['message_id', 'updated_at'])
        message_id = sent.message_id
        headers = {'Message-ID': message_id}
        thread = case.inbound_message.thread if case.inbound_message_id else None
        in_reply_to = references = ''
        if thread is not None:
            in_reply_to, references = reply_headers(thread, case.inbound_message)
            headers.update({'In-Reply-To': in_reply_to, 'References': references})
        message = EmailMessage(
            subject=sent.subject, body=sent.body, from_email=from_email, to=[sent.to_address], headers=headers,
            connection=connection,
        )
        for leaflet in sent.draft.leaflets.all():
            with leaflet.file.open('rb') as handle:
                message.attach(leaflet.original_filename, handle.read(), 'application/pdf')
        if sent.draft.attach_report and sent.case.report_id:
            document = sent.case.report.document
            with document.file.open('rb') as handle:
                message.attach(document.original_filename, handle.read(), document.content_type)
        try:
            message.send(fail_silently=False)
        except EMAIL_RETRYABLE_EXCEPTIONS:
            raise
        except Exception as exc:  # noqa: BLE001 - the case goes back to the doctor with the reason
            return _failed(sent, type(exc).__name__)
        sent.status, sent.sent_at = SentEmail.Status.SENT, timezone.now()
        sent.from_address = parseaddr(from_email)[1]
        sent.save(update_fields=['status', 'sent_at', 'from_address', 'updated_at'])
        ResultsCase.objects.filter(pk=sent.case_id).update(status=ResultsCase.Status.SENT, updated_at=timezone.now())
        ReviewAction.objects.create(case=sent.case, action=ReviewAction.Action.SENT,
                                    details={'message_id': sent.message_id})
        # Keep it in the patient's thread, where their reply will land.
        record_outgoing(
            case.organization, message_id=message_id, subject=sent.subject, body=sent.body, from_address=from_email,
            to_addresses=[sent.to_address], patient=case.patient, in_reply_to=in_reply_to, references=references,
            attachment_names=[a['name'] for a in sent.attachments], sent_email=sent, sent_by=sent.approved_by,
            thread=thread,
        )
        guard.record(sent.message_id)
        return sent.message_id


def _failed(sent, error: str, detail: str = ''):
    """The email did not go: the case returns to the doctor as a draft, with the reason logged."""
    from .models import ResultsCase, ReviewAction, SentEmail

    sent.status, sent.error = SentEmail.Status.FAILED, error
    sent.save(update_fields=['status', 'error', 'updated_at'])
    ResultsCase.objects.filter(pk=sent.case_id).update(status=ResultsCase.Status.DRAFTED)
    ReviewAction.objects.create(case=sent.case, action=ReviewAction.Action.SEND_FAILED,
                                details={'error': error, 'detail': detail})
    logger.error('Results email %s failed (%s)', sent.pk, error)
    return None
