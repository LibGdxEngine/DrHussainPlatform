"""
The review queue: the only route by which a results email leaves the clinic.

Each read report opens one case. The router decides whether it gets a draft or goes to the doctor
flagged; nothing is sent until the doctor approves, and every action is logged with its time.
"""
from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.content.models import EmailTemplate, EmailTemplateVersion, LeafletVersion, PrescriptionVersion
from product.patients.models import Language, Patient
from product.results.models import InvestigationReport


class ResultsCase(BaseModel):
    class Status(models.TextChoices):
        FLAGGED = 'flagged', 'Needs the doctor'
        AWAITING_PLAN = 'awaiting_plan', 'Doctor to choose the plan'
        DRAFTED = 'drafted', 'Draft ready for review'
        SENDING = 'sending', 'Approved, sending'
        SENT = 'sent', 'Sent'
        REJECTED = 'rejected', 'Rejected'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='results_cases')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='results_cases')
    report = models.OneToOneField(InvestigationReport, on_delete=models.PROTECT, related_name='case')
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)
    # Which email the router chose: a template kind such as 'infection', or '' while flagged.
    route = models.CharField(max_length=20, blank=True, default='')
    flag_reasons = models.JSONField(default=list, blank=True)
    # For an abnormal smear: the cervical smear section (2-14) the doctor picked.
    plan_template = models.ForeignKey(EmailTemplate, on_delete=models.PROTECT, null=True, blank=True,
                                      related_name='+')
    # The doctor chose to draft despite the report's flags; cleared when the report is read again.
    flags_overridden = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_status_display()}: {self.patient.file_number}'

    @property
    def current_draft(self):
        return self.drafts.filter(is_current=True).order_by('-created_at').first()


class Draft(BaseModel):
    """
    A results email waiting for the doctor. A new draft (another language, a different plan, a chosen
    prescription) replaces the current one; older drafts are kept with the case.
    """
    case = models.ForeignKey(ResultsCase, on_delete=models.CASCADE, related_name='drafts')
    is_current = models.BooleanField(default=True)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.ENGLISH)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    # Labels the doctor still has to fill in before it can be sent.
    open_slots = models.JSONField(default=list, blank=True)
    # Exactly which wording and list items this draft came from.
    template_versions = models.ManyToManyField(EmailTemplateVersion, blank=True, related_name='drafts')
    prescriptions = models.ManyToManyField(PrescriptionVersion, blank=True, related_name='drafts')
    leaflets = models.ManyToManyField(LeafletVersion, blank=True, related_name='drafts')
    follow_up = models.TextField(blank=True, default='')
    attach_report = models.BooleanField(default=False)
    edited = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')

    class Meta:
        ordering = ['-created_at']


class ReviewAction(BaseModel):
    class Action(models.TextChoices):
        OPENED = 'opened', 'Case opened'
        FLAGGED = 'flagged', 'Flagged for the doctor'
        DRAFTED = 'drafted', 'Draft built'
        PLAN_CHOSEN = 'plan_chosen', 'Plan chosen'
        OPTIONS_CHOSEN = 'options_chosen', 'Prescription or follow-up chosen'
        EDITED = 'edited', 'Draft edited'
        DRAFTED_ANYWAY = 'drafted_anyway', 'Drafted despite flags'
        ARABIC_DRAFTED = 'arabic_drafted', 'Arabic draft built'
        APPROVED = 'approved', 'Approved and sent'
        SENT = 'sent', 'Delivered to the mail server'
        SEND_FAILED = 'send_failed', 'Sending failed'
        REJECTED = 'rejected', 'Rejected'
        REROUTED = 'rerouted', 'Report read again'

    case = models.ForeignKey(ResultsCase, on_delete=models.CASCADE, related_name='actions')
    action = models.CharField(max_length=20, choices=Action.choices)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='+')
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['created_at']


class SentEmail(BaseModel):
    """A copy of exactly what went to the patient, kept with the case."""

    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        SENT = 'sent', 'Sent'
        FAILED = 'failed', 'Failed'

    case = models.ForeignKey(ResultsCase, on_delete=models.PROTECT, related_name='sent_emails')
    # A failed send returns the case to the doctor, so one draft can have several attempts.
    draft = models.ForeignKey(Draft, on_delete=models.PROTECT, related_name='sent_emails')
    to_address = models.EmailField()
    from_address = models.EmailField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    attachments = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    message_id = models.CharField(max_length=255, blank=True, default='')
    error = models.CharField(max_length=255, blank=True, default='')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                    related_name='+')
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
