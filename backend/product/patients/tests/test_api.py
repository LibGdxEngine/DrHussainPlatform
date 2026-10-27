from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.patients.models import Patient
from product.patients.services import create_patient
from product.testing import make_member, make_user

URL = '/api/product/patients/'


class PatientApiTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.client.force_authenticate(self.staff)
        self.payload = {
            'full_name': 'Laila Ahmed', 'date_of_birth': '1974-03-09', 'mobile': '+201000000001',
            'first_contact_channel': 'whatsapp',
        }

    def test_requires_sign_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_clinic_membership(self):
        self.client.force_authenticate(make_user('nobody@example.com'))
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['error']['code'], 'ORGANIZATION_REQUIRED')

    def test_create_issues_file_number_and_is_audited(self):
        response = self.client.post(URL, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['file_number'], 'VC-000001')
        self.assertEqual(response.data['preferred_language'], 'en')
        self.assertTrue(AuditLog.objects.filter(action='patient.created', resource_id=response.data['id']).exists())

    def test_duplicate_name_and_birthday_needs_confirmation(self):
        existing = create_patient(self.clinic, full_name='LAILA  AHMED', date_of_birth=date(1974, 3, 9))
        response = self.client.post(URL, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error']['code'], 'DUPLICATE_PATIENT')
        self.assertEqual(response.data['error']['context']['similar'][0]['file_number'], existing.file_number)

        confirmed = self.client.post(URL, {**self.payload, 'confirm_duplicate': True}, format='json')
        self.assertEqual(confirmed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Patient.objects.count(), 2)

    def test_rejects_future_date_of_birth(self):
        response = self.client.post(URL, {**self.payload, 'date_of_birth': '2999-01-01'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('date_of_birth', response.data['error']['fields'])

    def test_list_is_scoped_to_the_clinic_and_searchable(self):
        create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))
        create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1979, 6, 1))
        other = Organization.objects.create(name='Other', slug='other')
        create_patient(other, full_name='Laila Other', date_of_birth=date(1974, 3, 9))

        response = self.client.get(URL, {'q': 'laila'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([p['full_name'] for p in response.data['results']], ['Laila Ahmed'])

        by_number = self.client.get(URL, {'file_number': 'vc-000002'})
        self.assertEqual([p['full_name'] for p in by_number.data['results']], ['Nour Saleh'])

    def test_search_by_arabic_name_and_nearby_date_of_birth(self):
        create_patient(self.clinic, full_name='Laila Ahmed', full_name_ar='ليلى أحمد', date_of_birth=date(1974, 3, 9))
        create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1974, 9, 3))
        create_patient(self.clinic, full_name='Salma Nabil', date_of_birth=date(1990, 1, 1))

        arabic = self.client.get(URL, {'q': 'ليلي'})
        self.assertEqual([p['full_name'] for p in arabic.data['results']], ['Laila Ahmed'])
        self.assertEqual(arabic.data['results'][0]['full_name_ar'], 'ليلى أحمد')

        nearby = self.client.get(URL, {'date_of_birth': '1974-03-10'})
        self.assertEqual(nearby.data['count'], 2)
        self.assertEqual([p['full_name'] for p in nearby.data['results']], ['Laila Ahmed', 'Nour Saleh'])
        self.assertTrue(AuditLog.objects.filter(action='patient.searched').exists())

        bad = self.client.get(URL, {'date_of_birth': '10/03/1974'})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('date_of_birth', bad.data['error']['fields'])

    def test_create_stores_arabic_name(self):
        response = self.client.post(URL, {**self.payload, 'full_name_ar': ' ليلى  أحمد '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['full_name_ar'], 'ليلى أحمد')

    def test_other_clinic_patient_is_not_found(self):
        other = Organization.objects.create(name='Other', slug='other')
        stranger = create_patient(other, full_name='Laila Other', date_of_birth=date(1974, 3, 9))
        self.assertEqual(self.client.get(f'{URL}{stranger.id}/').status_code, status.HTTP_404_NOT_FOUND)

    def test_opening_a_file_is_audited(self):
        patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))
        response = self.client.get(f'{URL}{patient.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(AuditLog.objects.filter(action='patient.opened', resource_id=str(patient.id)).exists())

    def test_file_number_cannot_be_changed_and_files_cannot_be_deleted(self):
        patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))
        self.client.patch(f'{URL}{patient.id}/', {'file_number': 'VC-123456', 'preferred_language': 'ar'}, format='json')
        patient.refresh_from_db()
        self.assertEqual(patient.file_number, 'VC-000001')
        self.assertEqual(patient.preferred_language, 'ar')
        self.assertEqual(self.client.delete(f'{URL}{patient.id}/').status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_member_of_two_clinics_must_choose(self):
        second = Organization.objects.create(name='Second', slug='second')
        OrganizationMember.objects.create(organization=second, user=self.staff)
        create_patient(second, full_name='Second Patient', date_of_birth=date(1980, 1, 1))
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(URL, HTTP_X_ORGANIZATION_ID=str(second.id))
        self.assertEqual([p['full_name'] for p in response.data['results']], ['Second Patient'])
