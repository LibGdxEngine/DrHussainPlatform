from datetime import date, datetime, time, timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization
from product.appointments.models import Appointment
from product.intake.models import IntakeForm
from product.patients.services import create_patient
from product.testing import make_member, make_user

URL = '/api/product/appointments/'


def at(day: date, hour: int, minute: int = 0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class AppointmentApiTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'reception@example.com')
        self.client.force_authenticate(self.staff)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 14),
                                      email='laila@example.com')
        self.tomorrow = timezone.localdate() + timedelta(days=1)

    def book(self, **fields):
        payload = {'patient': str(self.patient.pk), 'starts_at': at(self.tomorrow, 9, 30).isoformat(),
                   'kind': 'visit2', **fields}
        return self.client.post(URL, payload, format='json')

    def test_requires_clinic_membership(self):
        self.client.force_authenticate(make_user('nobody@example.com'))
        self.assertEqual(self.client.get(URL, {'date': self.tomorrow}).status_code, status.HTTP_403_FORBIDDEN)

    def test_book_list_by_day_and_audit(self):
        response = self.book(reason='Menopause tests')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booked = response.data['appointment']
        self.assertEqual(booked['kind_label'], 'Visit 2 · tests')
        self.assertTrue(booked['needs_scanning'])
        self.assertEqual(booked['form_kind'], '')
        self.assertIsNone(response.data['form_link'])
        self.assertTrue(AuditLog.objects.filter(action='appointment.booked', resource_id=booked['id']).exists())

        listed = self.client.get(URL, {'date': self.tomorrow.isoformat()})
        self.assertEqual([a['id'] for a in listed.data['results']], [booked['id']])
        self.assertEqual(listed.data['results'][0]['patient']['file_number'], self.patient.file_number)
        self.assertEqual(self.client.get(URL, {'date': (self.tomorrow + timedelta(days=1)).isoformat()}).data['results'], [])

    def test_list_needs_a_day_or_patient(self):
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_400_BAD_REQUEST)
        self.book()
        self.assertEqual(self.client.get(URL, {'patient': str(self.patient.pk)}).data['count'], 1)

    def test_other_clinics_patients_and_visits_are_out_of_reach(self):
        other = Organization.objects.create(name='Other', slug='other')
        stranger = create_patient(other, full_name='Someone Else', date_of_birth=date(1980, 1, 1))
        response = self.book(patient=str(stranger.pk))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        theirs = Appointment.objects.create(organization=other, patient=stranger, starts_at=at(self.tomorrow, 10),
                                            kind='visit1')
        self.assertEqual(self.client.get(f'{URL}{theirs.pk}/').status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(URL, {'date': self.tomorrow.isoformat()}).data['results'], [])

    def test_check_in_and_cancel(self):
        booked = self.book().data['appointment']
        response = self.client.post(f'{URL}{booked["id"]}/check-in/')
        self.assertEqual(response.data['status'], 'checked_in')
        self.assertEqual(response.data['checked_in_by_name'], 'reception@example.com')

        response = self.client.patch(f'{URL}{booked["id"]}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.data['status'], 'cancelled')
        self.assertEqual(self.client.get(URL, {'date': self.tomorrow.isoformat()}).data['results'], [])
        self.assertEqual(self.client.post(f'{URL}{booked["id"]}/check-in/').status_code, status.HTTP_409_CONFLICT)

    def test_status_cannot_be_set_to_checked_in_directly(self):
        booked = self.book().data['appointment']
        response = self.client.patch(f'{URL}{booked["id"]}/', {'status': 'checked_in'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_day_counts(self):
        self.book()
        self.book(starts_at=at(self.tomorrow, 11).isoformat())
        response = self.client.get(f'{URL}days/', {'from': self.tomorrow.isoformat(),
                                                   'to': (self.tomorrow + timedelta(days=4)).isoformat()})
        self.assertEqual(response.data, [{'date': self.tomorrow.isoformat(), 'count': 2}])

    @override_settings(MAIL_ALLOW_PLATFORM_FALLBACK=True)
    def test_booking_a_first_visit_emails_the_form(self):
        with mock.patch('product.mail.tasks.send_thread_reply.delay') as send, self.captureOnCommitCallbacks(execute=True):
            response = self.book(kind='visit1', send_form=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['form_link'])
        form = IntakeForm.objects.get()
        self.assertEqual((form.kind, form.sent_via), ('full', 'email'))
        self.assertEqual(response.data['appointment']['form']['status'], 'not_started')
        send.assert_called_once()

    def test_booking_without_email_returns_the_link_to_copy(self):
        self.patient.email = ''
        self.patient.save()
        response = self.book(kind='followup_3m', send_form=True)
        self.assertIn('/emr/intake#t=', response.data['form_link'])
        self.assertIn('no email address', response.data['form_notice'])
        form = IntakeForm.objects.get()
        self.assertEqual((form.kind, form.sent_via), ('followup', 'copied'))
