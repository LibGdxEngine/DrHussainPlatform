import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMessage
from django.core.mail.message import make_msgid
from django.utils import timezone

from apps.common.tasks import idempotent
from apps.notifications.tasks.email import EMAIL_RETRYABLE_EXCEPTIONS

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='product.review.tasks.send_case_email', autoretry_for=EMAIL_RETRYABLE_EXCEPTIONS)
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
        # Phase 5 replaces this with the clinic's own mail server; until then the platform's
        # configured EMAIL_BACKEND (the console in development) carries it.
        # Set the Message-ID ourselves: replies are matched to the patient's thread by it.
        message_id = make_msgid(domain=settings.DEFAULT_FROM_EMAIL.rpartition('@')[2] or None)
        message = EmailMessage(
            subject=sent.subject, body=sent.body, from_email=settings.DEFAULT_FROM_EMAIL, to=[sent.to_address],
            headers={'Message-ID': message_id},
        )
        for leaflet in sent.draft.leaflets.all():
            with leaflet.file.open('rb') as handle:
                message.attach(leaflet.original_filename, handle.read(), 'application/pdf')
        if sent.draft.attach_report:
            document = sent.case.report.document
            with document.file.open('rb') as handle:
                message.attach(document.original_filename, handle.read(), document.content_type)
        try:
            message.send(fail_silently=False)
        except EMAIL_RETRYABLE_EXCEPTIONS:
            raise
        except Exception as exc:
            sent.status, sent.error = SentEmail.Status.FAILED, type(exc).__name__
            sent.save(update_fields=['status', 'error', 'updated_at'])
            ResultsCase.objects.filter(pk=sent.case_id).update(status=ResultsCase.Status.DRAFTED)
            ReviewAction.objects.create(case=sent.case, action=ReviewAction.Action.SEND_FAILED,
                                        details={'error': type(exc).__name__})
            logger.error('Results email %s failed (%s)', sent_email_id, type(exc).__name__)
            return None
        sent.status, sent.sent_at = SentEmail.Status.SENT, timezone.now()
        sent.from_address, sent.message_id = settings.DEFAULT_FROM_EMAIL, message_id
        sent.save(update_fields=['status', 'sent_at', 'from_address', 'message_id', 'updated_at'])
        ResultsCase.objects.filter(pk=sent.case_id).update(status=ResultsCase.Status.SENT, updated_at=timezone.now())
        ReviewAction.objects.create(case=sent.case, action=ReviewAction.Action.SENT,
                                    details={'message_id': sent.message_id})
        guard.record(sent.message_id)
        return sent.message_id
