from datetime import date
from unittest import mock

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.mail.models import MailMessage
from product.orders.models import Order, RequestedTest
from product.patients.services import create_patient
from product.testing import make_member

ORDERS = '/api/product/orders/'
TESTS = '/api/product/orders/requested-tests/'


class OrderApiTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.reception = make_member(self.clinic, 'reception@example.com')
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 14),
                                      email='laila@example.com')
        self.lab_request = {
            'patient': str(self.patient.pk), 'kind': 'tests', 'title': 'Lab request: Baseline – all',
            'delivery': 'print', 'tests': [{'code': 'ferritin', 'name': 'Ferritin'}, {'code': 'tsh', 'name': 'TSH'}],
        }

    def test_only_the_doctor_issues_orders(self):
        self.client.force_authenticate(self.reception)
        self.assertEqual(self.client.post(ORDERS, self.lab_request, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_lab_request_creates_tests_to_track(self):
        response = self.client.post(ORDERS, self.lab_request, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual([t['name'] for t in response.data['tests']], ['Ferritin', 'TSH'])
        self.assertTrue(AuditLog.objects.filter(action='order.issued').exists())

        self.client.force_authenticate(self.reception)
        pending = self.client.get(TESTS, {'patient': str(self.patient.pk), 'status': 'pending'})
        self.assertEqual(pending.data['count'], 2)
        self.assertEqual(self.client.get(f'{TESTS}counts/').data, {'pending': 2, 'patients': 1})

        test_id = pending.data['results'][0]['id']
        response = self.client.patch(f'{TESTS}{test_id}/', {'status': 'clinic'}, format='json')
        self.assertEqual(response.data['status'], 'clinic')
        self.assertIsNotNone(response.data['arrived_at'])
        self.assertEqual(self.client.get(f'{TESTS}counts/').data['pending'], 1)

    def test_prescription_needs_medicines_and_lists_by_patient(self):
        body = {'patient': str(self.patient.pk), 'kind': 'prescription', 'title': 'Prescription', 'delivery': 'print'}
        self.assertEqual(self.client.post(ORDERS, body, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        body['medicines'] = [{'drug': 'Estradiol gel 0.06%', 'dose': '2 pumps', 'directions': 'Daily to the skin'}]
        self.assertEqual(self.client.post(ORDERS, body, format='json').status_code, status.HTTP_201_CREATED)
        listed = self.client.get(ORDERS, {'patient': str(self.patient.pk)})
        self.assertEqual(listed.data['results'][0]['medicines'][0]['drug'], 'Estradiol gel 0.06%')
        self.assertEqual(self.client.get(ORDERS).data['results'], [])

    @override_settings(MAIL_ALLOW_PLATFORM_FALLBACK=True)
    def test_email_delivery_goes_through_the_clinic_mailbox(self):
        with mock.patch('product.mail.tasks.send_thread_reply.delay') as send, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(ORDERS, {**self.lab_request, 'delivery': 'email', 'sent_to': 'lab@example.com'},
                                        format='json')
        self.assertEqual(response.data['email_status'], 'queued')
        message = MailMessage.objects.get()
        self.assertEqual(message.to_addresses, ['lab@example.com'])
        self.assertIn('Ferritin', message.body_text)
        send.assert_called_once()

    @override_settings(MAIL_ALLOW_PLATFORM_FALLBACK=False)
    def test_email_without_mailbox_saves_nothing(self):
        response = self.client.post(ORDERS, {**self.lab_request, 'delivery': 'email'}, format='json')
        self.assertEqual(response.data['error']['code'], 'MAILBOX_NOT_READY')
        self.assertFalse(Order.objects.exists())
        self.assertFalse(RequestedTest.objects.exists())

    def test_cannot_order_for_another_clinics_patient(self):
        other = Organization.objects.create(name='Other', slug='other')
        stranger = create_patient(other, full_name='Someone', date_of_birth=date(1980, 1, 1))
        response = self.client.post(ORDERS, {**self.lab_request, 'patient': str(stranger.pk)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
