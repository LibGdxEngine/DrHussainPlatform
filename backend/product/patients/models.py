from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class ContactChannel(models.TextChoices):
    WHATSAPP = 'whatsapp', 'WhatsApp'
    EMAIL = 'email', 'Email'
    PHONE = 'phone', 'Phone'
    WALKIN = 'walkin', 'Walk-in'


class Language(models.TextChoices):
    ENGLISH = 'en', 'English'
    ARABIC = 'ar', 'Arabic'


class FileNumberSequence(models.Model):
    """Last file number issued per clinic; rows are locked while a number is taken."""
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, primary_key=True)
    last_value = models.PositiveIntegerField(default=0)


class Patient(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='patients')
    file_number = models.CharField(max_length=20, editable=False)
    full_name = models.CharField(max_length=255)
    full_name_ar = models.CharField('Arabic name', max_length=255, blank=True, default='')
    # Lower-cased, single-spaced names for search, duplicate warnings and report matching.
    normalized_name = models.CharField(max_length=255, editable=False, db_index=True)
    normalized_name_ar = models.CharField(max_length=255, editable=False, blank=True, default='', db_index=True)
    date_of_birth = models.DateField(db_index=True)
    mobile = models.CharField(max_length=32, blank=True, default='')
    whatsapp = models.CharField(max_length=32, blank=True, default='')
    email = models.EmailField(blank=True, default='', db_index=True)
    referring_doctor = models.CharField(max_length=255, blank=True, default='')
    first_contact_channel = models.CharField(
        max_length=20, choices=ContactChannel.choices, default=ContactChannel.WHATSAPP,
    )
    preferred_language = models.CharField(max_length=2, choices=Language.choices, default=Language.ENGLISH)

    class Meta:
        ordering = ['full_name', 'file_number']
        constraints = [
            models.UniqueConstraint(fields=['organization', 'file_number'], name='patients_file_number_per_org'),
        ]

    def __str__(self):
        return f'{self.full_name} ({self.file_number})'

    def save(self, *args, **kwargs):
        from .services import normalize_name
        self.normalized_name = normalize_name(self.full_name)
        self.normalized_name_ar = normalize_name(self.full_name_ar)
        super().save(*args, **kwargs)
