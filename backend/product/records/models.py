import uuid

from django.conf import settings
from django.core.files.storage import storages
from django.db import models

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
