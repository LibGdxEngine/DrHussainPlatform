from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.patients.models import Patient
from product.records.models import Document


class LabTest(BaseModel):
    """A test the clinic tracks. Each lab's own name for it is a LabTestAlias."""

    class Kind(models.TextChoices):
        NUMERIC = 'numeric', 'Numeric'
        QUALITATIVE = 'qualitative', 'Detected / not detected'
        TEXT = 'text', 'Report text'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='lab_tests')
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=128)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.NUMERIC)
    default_unit = models.CharField(max_length=32, blank=True, default='')
    # The clinic's optimal target, which can be tighter than the lab's reference range.
    optimal_low = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    optimal_high = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    optimal_text = models.CharField(max_length=128, blank=True, default='')
    tracked = models.BooleanField(default=False, help_text='Shown in the key values panel for manual entry.')
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(fields=['organization', 'code'], name='results_lab_test_code_per_org'),
        ]

    def __str__(self):
        return self.name


class LabTestAlias(BaseModel):
    lab_test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='aliases')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='lab_test_aliases')
    # Normalised with product.results.catalog.normalize_test_name.
    alias = models.CharField(max_length=128)

    class Meta:
        ordering = ['alias']
        constraints = [
            models.UniqueConstraint(fields=['organization', 'alias'], name='results_alias_unique_per_org'),
        ]

    def __str__(self):
        return f'{self.alias} → {self.lab_test.code}'


class ReportType(models.TextChoices):
    BLOODS = 'bloods', 'Blood tests'
    MENOPAUSE_BLOODS = 'menopause_bloods', 'Menopause / perimenopause bloods'
    INFECTION = 'infection', 'Infections and STIs'
    PATHOLOGY = 'pathology', 'Pathology report'
    SMEAR_NORMAL = 'smear_normal', 'Cervical smear, normal'
    SMEAR_ABNORMAL = 'smear_abnormal', 'Cervical smear, abnormal'
    UNKNOWN = 'unknown', 'Not recognised'


class InvestigationReport(BaseModel):
    """What the platform read from one uploaded report, or what staff typed in from it."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Waiting to be read'
        PARSED = 'parsed', 'Read'
        FLAGGED = 'flagged', 'Needs the doctor'
        CONFIRMED = 'confirmed', 'Checked by the doctor'

    class Method(models.TextChoices):
        TEXT = 'text', 'PDF text'
        OCR = 'ocr', 'OCR of a scan'
        MANUAL = 'manual', 'Typed in by staff'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='investigation_reports')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='investigation_reports')
    document = models.OneToOneField(Document, on_delete=models.PROTECT, related_name='report')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    report_type = models.CharField(max_length=30, choices=ReportType.choices, default=ReportType.UNKNOWN)
    method = models.CharField(max_length=10, choices=Method.choices, blank=True, default='')
    parser = models.CharField(max_length=64, blank=True, default='')
    lab_name = models.CharField(max_length=255, blank=True, default='')
    collected_on = models.DateField(null=True, blank=True)
    # Patient identifiers printed on the report: name, date_of_birth, file_number.
    identifiers = models.JSONField(default=dict, blank=True)
    match_status = models.CharField(max_length=20, blank=True, default='')
    flag_reasons = models.JSONField(default=list, blank=True)
    in_history = models.BooleanField(
        default=False, db_index=True, help_text='Its values are used as earlier results for comparisons.',
    )
    raw_text = models.TextField(blank=True, default='')
    processed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['-collected_on', '-created_at']

    def __str__(self):
        return f'{self.get_report_type_display()} for {self.patient.file_number}'

    def refresh_history_eligibility(self) -> None:
        """Values join the patient's history only when we are sure the report is this patient's."""
        patient_doubt = any(reason.startswith('patient_') for reason in self.flag_reasons)
        self.in_history = self.status == self.Status.CONFIRMED or (
            self.status in {self.Status.PARSED, self.Status.FLAGGED} and not patient_doubt
        )


class ResultValue(BaseModel):
    class Flag(models.TextChoices):
        HIGH = 'H', 'High'
        LOW = 'L', 'Low'
        ABNORMAL = 'A', 'Abnormal'
        NORMAL = 'N', 'Normal'

    class Source(models.TextChoices):
        EXTRACTED = 'extracted', 'Read from the report'
        MANUAL = 'manual', 'Typed in by staff'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='result_values')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='result_values')
    report = models.ForeignKey(InvestigationReport, on_delete=models.CASCADE, related_name='values')
    lab_test = models.ForeignKey(LabTest, on_delete=models.SET_NULL, null=True, blank=True, related_name='values')
    raw_name = models.CharField(max_length=255)
    value_text = models.CharField(max_length=255, blank=True, default='')
    value_numeric = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    unit = models.CharField(max_length=32, blank=True, default='')
    ref_low = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    ref_high = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    ref_text = models.CharField(max_length=128, blank=True, default='')
    flag = models.CharField(max_length=1, choices=Flag.choices, blank=True, default='')
    result_date = models.DateField(null=True, blank=True, db_index=True)
    lab_name = models.CharField(max_length=255, blank=True, default='')
    unreadable = models.BooleanField(default=False)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.EXTRACTED)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['report', 'position']
        indexes = [models.Index(fields=['patient', 'lab_test', 'result_date'])]

    def __str__(self):
        return f'{self.raw_name}: {self.value_text} {self.unit}'.strip()

    @property
    def is_abnormal(self) -> bool:
        return self.flag in {self.Flag.HIGH, self.Flag.LOW, self.Flag.ABNORMAL}
