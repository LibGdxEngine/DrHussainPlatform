from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.appointments.models import Appointment
from product.patients.models import Patient


class Order(BaseModel):
    """What the doctor requested or prescribed for a patient, and how it left the clinic."""

    class Kind(models.TextChoices):
        TESTS = 'tests', 'Tests'
        PRESCRIPTION = 'prescription', 'Prescription'

    class Delivery(models.TextChoices):
        EMAIL = 'email', 'Email'
        PRINT = 'print', 'Printed'
        IN_CLINIC = 'in_clinic', 'Done in clinic'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='orders')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='orders')
    appointment = models.ForeignKey(Appointment, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='orders')
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=255)
    delivery = models.CharField(max_length=20, choices=Delivery.choices)
    sent_to = models.EmailField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    mail_message = models.ForeignKey('mail.MailMessage', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='+')
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                  related_name='issued_orders')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['organization', 'patient'], name='orders_org_patient_idx')]

    def __str__(self):
        return f'{self.title} for {self.patient}'


class RequestedTest(BaseModel):
    """One test the patient should bring back; reception ticks it off as it arrives."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Waiting'
        CLINIC = 'clinic', 'Arrived at clinic'
        EMAIL = 'email', 'Arrived by email'
        ENTERED = 'entered', 'Entered'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='requested_tests')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='tests')
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='requested_tests')
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=128)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    arrived_at = models.DateTimeField(null=True, blank=True)
    document = models.ForeignKey('records.Document', on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='requested_tests')

    class Meta:
        ordering = ['created_at', 'name']
        indexes = [models.Index(fields=['organization', 'status'], name='orders_test_org_status_idx')]

    def __str__(self):
        return self.name


class PrescribedMedicine(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='medicines')
    prescription_item = models.ForeignKey('content.PrescriptionItem', on_delete=models.SET_NULL, null=True,
                                          blank=True, related_name='+')
    drug = models.CharField(max_length=255)
    dose = models.CharField(max_length=255, blank=True, default='')
    directions = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.drug
