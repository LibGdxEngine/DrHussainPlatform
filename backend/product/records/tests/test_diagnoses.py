from datetime import date
from unittest.mock import patch

from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.patients.services import create_patient
from product.records.models import Diagnosis, DiagnosisRevision
from product.testing import make_member

URL = '/api/product/records/diagnoses/'


class DiagnosisApiTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='Clinic', slug='clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', OrganizationMember.Role.OWNER)
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.patient = create_patient(self.clinic, full_name='Example Patient', date_of_birth=date(1980, 1, 1))
        self.client.force_authenticate(self.doctor)

    def create_diagnosis(self, **extra):
        body = {'patient': str(self.patient.pk), 'name': 'A custom diagnosis', 'status': 'suspected',
                'noted_on': '2026-01-20', 'notes': 'Initial assessment'}
        body.update(extra)
        return self.client.post(URL, body, format='json')

    def test_create_and_update_preserve_authored_versions_and_audit(self):
        created = self.create_diagnosis()
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['version'], 1)
        self.assertEqual(created.data['revisions'][0]['notes'], 'Initial assessment')
        self.assertEqual(created.data['revisions'][0]['author_name'], self.doctor.email)
        pk = created.data['id']
        updated = self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'status': 'confirmed',
                                                    'notes': 'Confirmed by examination'}, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['version'], 2)
        self.assertEqual([r['status'] for r in updated.data['revisions']], ['confirmed', 'suspected'])
        self.assertEqual(updated.data['revisions'][1]['notes'], 'Initial assessment')
        self.assertTrue(AuditLog.objects.filter(action='diagnosis.created', resource_id=pk).exists())
        self.assertTrue(AuditLog.objects.filter(action='diagnosis.updated', resource_id=pk).exists())
        self.assertEqual(self.client.delete(f'{URL}{pk}/').status_code, 405)

    def test_stale_update_is_rejected_without_losing_history(self):
        pk = self.create_diagnosis().data['id']
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'status': 'resolved'}, format='json').status_code, 200)
        stale = self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'notes': 'stale'}, format='json')
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data['error']['code'], 'DIAGNOSIS_CONFLICT')
        self.assertEqual(DiagnosisRevision.objects.filter(diagnosis_id=pk).count(), 2)
        self.assertEqual(Diagnosis.objects.get(pk=pk).notes, 'Initial assessment')
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'notes': 'missing version'}, format='json').status_code, 400)

    def test_scope_permissions_and_patient_immutability(self):
        pk = self.create_diagnosis().data['id']
        other = Organization.objects.create(name='Other', slug='other')
        other_patient = create_patient(other, full_name='Other Patient', date_of_birth=date(1970, 1, 1))
        self.assertEqual(self.create_diagnosis(patient=str(other_patient.pk)).status_code, 400)
        another = create_patient(self.clinic, full_name='Another Patient', date_of_birth=date(1985, 1, 1))
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'patient': str(another.pk)}, format='json').status_code, 400)
        self.assertEqual(self.client.get(URL).status_code, 400)
        self.assertEqual(self.client.get(URL, {'patient': 'invalid'}).status_code, 400)
        self.assertEqual(self.client.get(URL, {'patient': str(another.pk)}).data['results'], [])
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL, {'patient': str(self.patient.pk)}).status_code, 403)
        self.assertEqual(self.create_diagnosis().status_code, 403)
        outsider = make_member(other, 'outside@example.com', OrganizationMember.Role.OWNER)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(f'{URL}{pk}/').status_code, 404)
        self.assertEqual(self.client.get(URL, {'patient': str(self.patient.pk)}).data['results'], [])

    def test_failed_revision_rolls_back_the_update(self):
        pk = self.create_diagnosis().data['id']
        with patch('product.records.views.DiagnosisViewSet._save_revision', side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):
                self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'status': 'resolved'}, format='json')
        self.assertEqual(Diagnosis.objects.get(pk=pk).version, 1)
        self.assertEqual(DiagnosisRevision.objects.filter(diagnosis_id=pk).count(), 1)
