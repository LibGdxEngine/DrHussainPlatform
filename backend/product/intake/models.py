from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.appointments.models import Appointment
from product.patients.models import Patient

# Menopause Rating Scale: 11 items scored 0 (none) to 4 (very severe).
MRS_ITEMS = 11
MRS_GROUPS = {
    'somatic': (0, 1, 2, 10),
    'psychological': (3, 4, 5, 6),
    'urogenital': (7, 8, 9),
}


class IntakeForm(BaseModel):
    """
    A form the patient fills in on their phone before a visit. The link carries a random token;
    only its hash is stored, so a link can be re-sent but never read back.
    """

    class Kind(models.TextChoices):
        FULL = 'full', 'Full history'
        FOLLOW_UP = 'followup', 'Follow-up'

    class Status(models.TextChoices):
        NOT_STARTED = 'not_started', 'Not started'
        IN_PROGRESS = 'in_progress', 'In progress'
        COMPLETE = 'complete', 'Complete'
        LOCKED = 'locked', 'Locked'

    class Delivery(models.TextChoices):
        EMAIL = 'email', 'Email'
        COPIED = 'copied', 'Link copied'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='intake_forms')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='intake_forms')
    appointment = models.ForeignKey(Appointment, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='forms')
    kind = models.CharField(max_length=10, choices=Kind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NOT_STARTED)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_via = models.CharField(max_length=10, choices=Delivery.choices, blank=True, default='')
    opened_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    answers = models.JSONField(default=dict, blank=True)
    mrs = models.JSONField(null=True, blank=True)
    mrs_total = models.PositiveSmallIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name='created_intake_forms')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['organization', 'patient'], name='intake_org_patient_idx')]

    def __str__(self):
        return f'{self.get_kind_display()} form for {self.patient}'

    @property
    def mrs_groups(self) -> dict[str, int] | None:
        if not self.mrs:
            return None
        return {name: sum(self.mrs[i] for i in items) for name, items in MRS_GROUPS.items()}
