import logging

from celery import shared_task
from django.core.cache import cache
from django.core.mail import EmailMessage
from django.utils import timezone

from apps.common.tasks import idempotent
from apps.notifications.tasks.email import EMAIL_RETRYABLE_EXCEPTIONS

logger = logging.getLogger(__name__)
POLL_LOCK_SECONDS = 300


@shared_task(name='product.mail.tasks.poll_mailboxes')
def poll_mailboxes():
    """Beat: check every clinic's mailbox for new mail."""
    from .models import Mailbox

    ids = [str(pk) for pk in Mailbox.objects.filter(enabled=True).exclude(imap_host='').values_list('pk', flat=True)]
    for pk in ids:
        poll_mailbox.delay(pk)
    return len(ids)


@shared_task(bind=True, name='product.mail.tasks.poll_mailbox')
def poll_mailbox(self, mailbox_id: str):
    """Take in one clinic's new mail. A lock keeps two polls of the same mailbox from overlapping."""
    from .models import Mailbox
    from .services import poll

    lock = f'mail:poll:{mailbox_id}'
    if not cache.add(lock, self.request.id or 'poll', POLL_LOCK_SECONDS):
        return None
    try:
        mailbox = Mailbox.objects.select_related('organization').get(pk=mailbox_id)
        if not mailbox.can_receive:
            return None
        try:
            return poll(mailbox)
        except Exception as exc:  # noqa: BLE001 - surfaced in mailbox settings, retried on the next beat
            mailbox.last_error = f'{type(exc).__name__}: {exc}'[:255]
            mailbox.save(update_fields=['last_error', 'updated_at'])
            logger.warning('Polling mailbox %s failed (%s)', mailbox_id, type(exc).__name__)
            return None
    finally:
        cache.delete(lock)


@shared_task(bind=True, name='product.mail.tasks.send_thread_reply', autoretry_for=EMAIL_RETRYABLE_EXCEPTIONS)
def send_thread_reply(self, message_id: str):
    """Deliver a reply the doctor wrote in the inbox. Keyed on the queued message, so it goes once."""
    from .models import MailMessage, MailThread
    from .transport import outgoing

    message = MailMessage.objects.select_related('thread', 'organization').get(pk=message_id)
    if message.status == MailMessage.Status.SENT:
        return message.message_id
    with idempotent(self.idempotency_key(message_id), task_name=self.name, task_id=self.request.id) as guard:
        if guard.is_duplicate:
            return guard.result
        connection, from_email = outgoing(message.organization)
        email = EmailMessage(
            subject=message.subject, body=message.body_text, from_email=from_email, to=message.to_addresses,
            connection=connection,
            headers={'Message-ID': message.message_id, 'In-Reply-To': message.in_reply_to,
                     'References': message.references} if message.in_reply_to else {'Message-ID': message.message_id},
        )
        for document in message.attached_documents.all():
            with document.file.open('rb') as handle:
                email.attach(document.original_filename, handle.read(), document.content_type)
        try:
            email.send(fail_silently=False)
        except EMAIL_RETRYABLE_EXCEPTIONS:
            raise
        except Exception as exc:  # noqa: BLE001 - shown on the message; the doctor can send again
            message.status, message.error = MailMessage.Status.FAILED, type(exc).__name__
            message.save(update_fields=['status', 'error', 'updated_at'])
            return None
        message.status, message.sent_at = MailMessage.Status.SENT, timezone.now()
        message.save(update_fields=['status', 'sent_at', 'updated_at'])
        MailThread.objects.filter(pk=message.thread_id).update(has_outbound=True, last_message_at=message.sent_at)
        guard.record(message.message_id)
        return message.message_id
