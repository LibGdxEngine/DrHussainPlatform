"""Queue a new email from the clinic mailbox, kept in a thread so replies land next to it."""
import uuid

from django.db import transaction
from django.utils import timezone

from .models import MailMessage, MailThread
from .transport import outgoing


def queue_email(organization, *, to_address: str, subject: str, body: str, patient=None, sent_by=None) -> MailMessage:
    """
    Start a thread and queue the message for the clinic's own server. Raises MailboxNotReady when
    there is no mailbox to send from.
    """
    from .tasks import send_thread_reply

    _, from_email = outgoing(organization)
    domain = from_email.rpartition('@')[2].strip('>') or 'localhost'
    now = timezone.now()
    with transaction.atomic():
        thread = MailThread.objects.create(
            organization=organization, patient=patient, subject=subject[:998], contact_email=to_address,
            contact_name=patient.full_name if patient and to_address == patient.email else '', last_message_at=now,
        )
        message = MailMessage.objects.create(
            organization=organization, thread=thread, direction=MailMessage.Direction.OUTBOUND,
            status=MailMessage.Status.QUEUED, message_id=f'<{uuid.uuid4().hex}@{domain}>', from_address=from_email,
            to_addresses=[to_address], subject=subject[:998], body_text=body, sent_at=now, sent_by=sent_by,
        )
        transaction.on_commit(lambda: send_thread_reply.delay(str(message.pk)))
    return message
