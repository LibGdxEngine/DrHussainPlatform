"""
The clinic's own mailbox. Results emails leave from it and patients' replies come back into it, so
every email stays in the patient's thread.
"""
from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.patients.models import Patient
from product.records.models import Document, private_storage

from .crypto import decrypt, encrypt


class Security(models.TextChoices):
    STARTTLS = 'starttls', 'STARTTLS'
    SSL = 'ssl', 'SSL/TLS'
    NONE = 'none', 'None (local test servers only)'


class Mailbox(BaseModel):
    """Connection details for the clinic's mail server. Passwords are stored encrypted."""
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name='mailbox')
    address = models.EmailField()
    display_name = models.CharField(max_length=255, blank=True, default='')
    enabled = models.BooleanField(default=False)

    smtp_host = models.CharField(max_length=255, blank=True, default='')
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_security = models.CharField(max_length=10, choices=Security.choices, default=Security.STARTTLS)
    smtp_username = models.CharField(max_length=255, blank=True, default='')
    smtp_password_encrypted = models.TextField(blank=True, default='')

    imap_host = models.CharField(max_length=255, blank=True, default='')
    imap_port = models.PositiveIntegerField(default=993)
    imap_security = models.CharField(max_length=10, choices=Security.choices, default=Security.SSL)
    imap_username = models.CharField(max_length=255, blank=True, default='')
    imap_password_encrypted = models.TextField(blank=True, default='')
    imap_folder = models.CharField(max_length=255, default='INBOX')

    # Where reading stopped: the IMAP UID of the last message taken in, for this UIDVALIDITY.
    last_uid = models.PositiveBigIntegerField(default=0)
    uid_validity = models.PositiveBigIntegerField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=255, blank=True, default='')

    def __str__(self):
        return self.address

    @property
    def smtp_password(self) -> str:
        return decrypt(self.smtp_password_encrypted)

    @smtp_password.setter
    def smtp_password(self, value: str):
        self.smtp_password_encrypted = encrypt(value)

    @property
    def imap_password(self) -> str:
        return decrypt(self.imap_password_encrypted)

    @imap_password.setter
    def imap_password(self, value: str):
        self.imap_password_encrypted = encrypt(value)

    @property
    def can_send(self) -> bool:
        return self.enabled and bool(self.smtp_host and self.address)

    @property
    def can_receive(self) -> bool:
        return self.enabled and bool(self.imap_host and self.imap_username)


class MailThread(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='mail_threads')
    # Set when the email belongs to a patient's file; empty for senders that matched nobody.
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, null=True, blank=True, related_name='mail_threads')
    # A likely patient found in an unmatched email (a file number in it), for staff to confirm.
    suggested_patient = models.ForeignKey(Patient, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    subject = models.CharField(max_length=998, blank=True, default='')
    contact_email = models.EmailField(blank=True, default='')
    contact_name = models.CharField(max_length=255, blank=True, default='')
    last_message_at = models.DateTimeField(db_index=True)
    has_inbound = models.BooleanField(default=False)
    has_outbound = models.BooleanField(default=False)
    unread = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['-last_message_at']

    def __str__(self):
        return self.subject or self.contact_email


class MailMessage(BaseModel):
    class Direction(models.TextChoices):
        INBOUND = 'in', 'Received'
        OUTBOUND = 'out', 'Sent'

    class Status(models.TextChoices):
        RECEIVED = 'received', 'Received'
        QUEUED = 'queued', 'Sending'
        SENT = 'sent', 'Sent'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='mail_messages')
    thread = models.ForeignKey(MailThread, on_delete=models.CASCADE, related_name='messages')
    direction = models.CharField(max_length=3, choices=Direction.choices)
    status = models.CharField(max_length=10, choices=Status.choices)
    message_id = models.CharField(max_length=998, db_index=True)
    in_reply_to = models.CharField(max_length=998, blank=True, default='')
    references = models.TextField(blank=True, default='')
    from_address = models.EmailField(blank=True, default='')
    from_name = models.CharField(max_length=255, blank=True, default='')
    to_addresses = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=998, blank=True, default='')
    body_text = models.TextField(blank=True, default='')
    sent_at = models.DateTimeField(db_index=True)
    imap_uid = models.PositiveBigIntegerField(null=True, blank=True)
    # Outgoing attachments are kept as names; the files are the leaflet or document versions sent.
    attachment_names = models.JSONField(default=list, blank=True)
    # Patient documents the doctor attached to an inbox reply.
    attached_documents = models.ManyToManyField(Document, blank=True, related_name='+')
    sent_email = models.OneToOneField('review.SentEmail', on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='mail_message')
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='+')
    error = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['sent_at', 'created_at']
        constraints = [
            models.UniqueConstraint(fields=['organization', 'message_id'], name='mail_message_id_per_org'),
        ]


def attachment_upload_to(instance, filename):
    return f'mail/{instance.message.organization_id}/{instance.message_id}/{instance.pk}'


class MailAttachment(BaseModel):
    """A file a patient, lab or doctor emailed in. Staff can save it into the patient's documents."""
    message = models.ForeignKey(MailMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(storage=private_storage, upload_to=attachment_upload_to, max_length=255)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    saved_document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['created_at']
