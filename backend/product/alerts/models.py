from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.content.models import AlertLevel, AlertRule, AlertRuleVersion
from product.patients.models import Patient
from product.results.models import InvestigationReport, ResultValue


class PatientAlert(BaseModel):
    """
    An alert rule that fired for a patient, kept with the exact rule version and value that fired
    it. It stays open until the doctor acknowledges it (with a reason) or a later result clears it.
    """

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged by the doctor'
        RESOLVED = 'resolved', 'Cleared by a later result'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='patient_alerts')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='alerts')
    rule = models.ForeignKey(AlertRule, on_delete=models.PROTECT, related_name='patient_alerts')
    rule_version = models.ForeignKey(AlertRuleVersion, on_delete=models.PROTECT, related_name='+')
    level = models.CharField(max_length=10, choices=AlertLevel.choices)
    message = models.CharField(max_length=255)
    # The result that fired it; empty for "never measured".
    value = models.ForeignKey(ResultValue, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    report = models.ForeignKey(InvestigationReport, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name='alerts')
    # The examination that fired a vitals rule (blood pressure, BMI, waist).
    examination = models.ForeignKey('records.Examination', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='alerts')
    detail = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN, db_index=True)
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='+')
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=500, blank=True, default='')
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['status', '-created_at']
        indexes = [models.Index(fields=['organization', 'status'], name='alerts_alert_org_status')]
        constraints = [
            # At most one open alert per patient and rule.
            models.UniqueConstraint(fields=['patient', 'rule'], condition=models.Q(status='open'),
                                    name='alerts_one_open_per_patient_rule'),
        ]

    def __str__(self):
        return f'{self.rule.code} for {self.patient.file_number} ({self.status})'
