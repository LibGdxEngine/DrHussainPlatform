import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.files.storage import storages
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.patients.models import Patient


def private_storage():
    return storages['private']


def document_upload_to(instance, filename):
    extension = Document.EXTENSIONS.get(instance.content_type, '')
    return f'documents/{instance.organization_id}/{instance.patient_id}/{uuid.uuid4().hex}{extension}'


class DocumentSlot(models.TextChoices):
    LAB = 'lab', 'Lab results'
    ULTRASOUND = 'us', 'Ultrasound'
    IMAGING = 'rad', 'Other imaging'
    PATHOLOGY = 'path', 'Pathology'
    PAPER = 'paper', 'Old paper notes'
    LETTER = 'letter', 'Letters'


class DocumentSource(models.TextChoices):
    CLINIC_SCAN = 'clinic_scan', 'Scanned at clinic'
    PATIENT = 'patient', 'Brought in by patient'
    EMAIL = 'email', 'By email'
    BULK_SCAN = 'bulk_scan', "Doctor's old files"
    UPLOAD = 'upload', 'Uploaded'


class Document(BaseModel):
    EXTENSIONS = {'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png'}

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='documents')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='documents')
    slot = models.CharField(max_length=10, choices=DocumentSlot.choices, db_index=True)
    title = models.CharField(max_length=255)
    document_date = models.DateField(null=True, blank=True, help_text='Date on the report, e.g. the sample date.')
    source = models.CharField(max_length=20, choices=DocumentSource.choices, default=DocumentSource.UPLOAD)
    file = models.FileField(storage=private_storage, upload_to=document_upload_to, max_length=255)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64, db_index=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_documents',
    )

    class Meta:
        ordering = ['-document_date', '-created_at']
        indexes = [models.Index(fields=['patient', 'slot'])]
        constraints = [
            models.UniqueConstraint(fields=['patient', 'sha256'], name='records_document_unique_per_patient'),
        ]

    def __str__(self):
        return f'{self.title} ({self.patient.file_number})'


class Diagnosis(BaseModel):
    class Status(models.TextChoices):
        SUSPECTED = 'suspected', 'Suspected'
        CONFIRMED = 'confirmed', 'Confirmed'
        RESOLVED = 'resolved', 'Resolved'
        RULED_OUT = 'ruled_out', 'Ruled out'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='diagnoses')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='diagnoses')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices)
    noted_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_diagnoses')

    class Meta:
        ordering = ['-updated_at', '-id']
        indexes = [models.Index(fields=['organization', 'patient'], name='records_diag_org_patient_idx')]


class DiagnosisRevision(BaseModel):
    diagnosis = models.ForeignKey(Diagnosis, on_delete=models.CASCADE, related_name='revisions')
    number = models.PositiveIntegerField()
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Diagnosis.Status.choices)
    noted_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='diagnosis_revisions')

    class Meta:
        ordering = ['-number']
        constraints = [models.UniqueConstraint(fields=['diagnosis', 'number'], name='records_diagnosis_revision_number')]


# The screening checklist on the exam screen; answers are stored as {key: True/False}.
SCREENING_ITEMS = {
    'mammogram': 'Mammogram up to date',
    'smear': 'Cervical smear up to date',
    'pelvic_us': 'Pelvic ultrasound (abnormal bleeding)',
    'dexa': 'DEXA if risk factors',
    'mood': 'Mood screen done',
    'contraception': 'Contraception plan (not perimenopausal)',
}

# Every field a revision snapshots: what the doctor recorded, not bookkeeping.
EXAMINATION_FIELDS = (
    'examined_on', 'bp1_systolic', 'bp1_diastolic', 'bp2_systolic', 'bp2_diastolic', 'height_cm', 'weight_kg',
    'waist_cm', 'breast_exam', 'pelvic_exam', 'screening', 'plan', 'plan_notes', 'next_review', 'send_follow_up_form',
)


def _today():
    return timezone.localdate()


class Examination(BaseModel):
    """One examination of a patient: vitals, findings, screening checklist and plan. Doctor-only, versioned."""

    class Plan(models.TextChoices):
        CONTINUE = 'continue', 'Continue'
        START = 'start', 'Start treatment'
        ADJUST = 'adjust', 'Adjust dose'
        ROUTE = 'route', 'Change route'
        INVESTIGATE = 'investigate', 'Investigate first'
        STOP = 'stop', 'Stop'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='examinations')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='examinations')
    examined_on = models.DateField(default=_today)
    bp1_systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    bp1_diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    bp2_systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    bp2_diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    waist_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    breast_exam = models.TextField(blank=True, default='')
    pelvic_exam = models.TextField(blank=True, default='')
    screening = models.JSONField(default=dict, blank=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, blank=True, default='')
    plan_notes = models.TextField(blank=True, default='')
    next_review = models.DateField(null=True, blank=True)
    send_follow_up_form = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name='created_examinations')

    class Meta:
        ordering = ['-examined_on', '-created_at']
        indexes = [models.Index(fields=['organization', 'patient'], name='records_exam_org_patient_idx')]

    @property
    def bp_average(self) -> tuple[int, int] | None:
        """(systolic, diastolic) averaged over the readings taken; one reading counts on its own."""
        readings = [(s, d) for s, d in ((self.bp1_systolic, self.bp1_diastolic),
                                        (self.bp2_systolic, self.bp2_diastolic)) if s and d]
        if not readings:
            return None
        count = len(readings)
        # Halves round up, as on the exam screen (Python's round() would round 140.5 down to 140).
        return tuple((2 * sum(values) + count) // (2 * count) for values in zip(*readings))

    @property
    def bmi(self) -> Decimal | None:
        if not self.height_cm or not self.weight_kg:
            return None
        metres = Decimal(self.height_cm) / 100
        return (Decimal(self.weight_kg) / (metres * metres)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)

    def snapshot(self) -> dict:
        """The recorded fields as JSON, for a revision."""
        data = {}
        for name in EXAMINATION_FIELDS:
            value = getattr(self, name)
            data[name] = value.isoformat() if hasattr(value, 'isoformat') else (
                str(value) if isinstance(value, Decimal) else value)
        return data


class ExaminationRevision(BaseModel):
    examination = models.ForeignKey(Examination, on_delete=models.CASCADE, related_name='revisions')
    number = models.PositiveIntegerField()
    data = models.JSONField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                               related_name='examination_revisions')

    class Meta:
        ordering = ['-number']
        constraints = [models.UniqueConstraint(fields=['examination', 'number'], name='records_examination_revision_number')]
