from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.patients.models import Patient


class VisitKind(models.TextChoices):
    VISIT_1 = 'visit1', 'Visit 1 · new patient'
    VISIT_2 = 'visit2', 'Visit 2 · tests'
    VISIT_3 = 'visit3', 'Visit 3'
    FOLLOW_UP_3M = 'followup_3m', '3-month follow-up'
    FOLLOW_UP_6M = 'followup_6m', '6-month follow-up'
    ANNUAL_REVIEW = 'annual_review', 'Annual HRT review'
    ROUTINE = 'routine', 'Routine check-up / smear'


# Which patient form a visit needs: the full history before a first or routine visit, the short
# follow-up form before a review. Visits 2 and 3 are for tests the patient brings, so none.
FULL_FORM_KINDS = {VisitKind.VISIT_1, VisitKind.ROUTINE}
FOLLOW_UP_FORM_KINDS = {VisitKind.FOLLOW_UP_3M, VisitKind.FOLLOW_UP_6M, VisitKind.ANNUAL_REVIEW}
# Visits where reception scans the files the patient brings.
SCAN_KINDS = {VisitKind.VISIT_2, VisitKind.VISIT_3, VisitKind.FOLLOW_UP_3M, VisitKind.FOLLOW_UP_6M}


class Appointment(BaseModel):
    class Status(models.TextChoices):
        BOOKED = 'booked', 'Booked'
        CHECKED_IN = 'checked_in', 'Checked in'
        SEEN = 'seen', 'Seen'
        CANCELLED = 'cancelled', 'Cancelled'
        NO_SHOW = 'no_show', 'Did not attend'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='appointments')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='appointments')
    starts_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=45)
    kind = models.CharField(max_length=20, choices=VisitKind.choices)
    reason = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.BOOKED)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='checked_in_appointments')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name='booked_appointments')

    class Meta:
        ordering = ['starts_at']
        indexes = [
            models.Index(fields=['organization', 'starts_at'], name='appt_org_starts_idx'),
            models.Index(fields=['organization', 'patient'], name='appt_org_patient_idx'),
        ]

    def __str__(self):
        return f'{self.patient} at {self.starts_at:%Y-%m-%d %H:%M}'

    @property
    def form_kind(self) -> str:
        """'full', 'followup' or '' (no form for this visit)."""
        if self.kind in FULL_FORM_KINDS:
            return 'full'
        if self.kind in FOLLOW_UP_FORM_KINDS:
            return 'followup'
        return ''

    @property
    def needs_scanning(self) -> bool:
        return self.kind in SCAN_KINDS
