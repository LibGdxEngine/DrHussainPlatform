from datetime import date
from unittest.mock import patch

from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.patients.services import create_patient
from product.records.models import Examination, ExaminationRevision
from product.testing import make_member

URL = '/api/product/records/examinations/'


class ExaminationApiTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='Clinic', slug='clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', OrganizationMember.Role.OWNER)
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.patient = create_patient(self.clinic, full_name='Example Patient', date_of_birth=date(1974, 1, 1))
        self.client.force_authenticate(self.doctor)

    def create_exam(self, **extra):
        body = {'patient': str(self.patient.pk), 'examined_on': '2026-10-20', 'bp1_systolic': 144,
                'bp1_diastolic': 92, 'bp2_systolic': 138, 'bp2_diastolic': 88, 'height_cm': '162',
                'weight_kg': '81', 'waist_cm': '91', 'breast_exam': 'No masses.', 'pelvic_exam': 'Normal cervix.',
                'screening': {'mammogram': False, 'smear': True}, 'plan': 'investigate',
                'plan_notes': 'Ultrasound first.', 'next_review': '2027-01-13', 'send_follow_up_form': True}
        body.update(extra)
        return self.client.post(URL, body, format='json')

    def test_create_computes_vitals_and_update_keeps_every_version(self):
        created = self.create_exam()
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['bp_average'], {'systolic': 141, 'diastolic': 90})
        self.assertEqual(created.data['bmi'], '30.9')
        self.assertEqual(created.data['version'], 1)
        self.assertEqual(created.data['revisions'][0]['data']['plan'], 'investigate')
        self.assertEqual(created.data['revisions'][0]['author_name'], self.doctor.email)
        pk = created.data['id']
        updated = self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'plan': 'start', 'bp2_systolic': None,
                                                    'bp2_diastolic': None}, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['version'], 2)
        self.assertEqual(updated.data['bp_average'], {'systolic': 144, 'diastolic': 92})  # one reading counts
        self.assertEqual([r['data']['plan'] for r in updated.data['revisions']], ['start', 'investigate'])
        self.assertEqual(updated.data['revisions'][1]['data']['bp2_systolic'], 138)
        self.assertTrue(AuditLog.objects.filter(action='examination.created', resource_id=pk).exists())
        update_log = AuditLog.objects.get(action='examination.updated', resource_id=pk)
        self.assertEqual(update_log.metadata['fields'], ['bp2_diastolic', 'bp2_systolic', 'plan'])
        # Sending the whole form again records only what actually changed.
        self.client.patch(f'{URL}{pk}/', {'expected_version': 2, 'plan': 'start', 'plan_notes': 'Recheck.'}, format='json')
        self.assertEqual(AuditLog.objects.filter(action='examination.updated', resource_id=pk)
                         .order_by('-created_at').first().metadata['fields'], ['plan_notes'])
        self.assertEqual(self.client.delete(f'{URL}{pk}/').status_code, 405)

    def test_list_is_the_patients_examinations_newest_first_and_audited(self):
        self.create_exam(examined_on='2026-07-01')
        self.create_exam(examined_on='2026-10-01')
        listed = self.client.get(URL, {'patient': str(self.patient.pk)})
        self.assertEqual([e['examined_on'] for e in listed.data['results']], ['2026-10-01', '2026-07-01'])
        self.assertTrue(AuditLog.objects.filter(action='examination.listed', metadata__count=2).exists())

    def test_stale_update_is_rejected_without_losing_history(self):
        pk = self.create_exam().data['id']
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'plan': 'stop'}, format='json').status_code, 200)
        stale = self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'plan_notes': 'stale'}, format='json')
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data['error']['code'], 'EXAMINATION_CONFLICT')
        self.assertEqual(ExaminationRevision.objects.filter(examination_id=pk).count(), 2)
        self.assertEqual(Examination.objects.get(pk=pk).plan_notes, 'Ultrasound first.')
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'plan': 'stop'}, format='json').status_code, 400)

    def test_implausible_or_half_readings_are_refused(self):
        half = self.create_exam(bp2_diastolic=None)
        self.assertEqual(half.status_code, 400)
        self.assertIn('bp2_systolic', half.data['error']['fields'])
        typo = self.create_exam(bp1_systolic=1440, weight_kg='8100')
        self.assertLessEqual({'bp1_systolic', 'weight_kg'}, set(typo.data['error']['fields']), typo.data)
        unknown = self.create_exam(screening={'xray': True})
        self.assertIn('screening', unknown.data['error']['fields'])
        pk = self.create_exam().data['id']
        # Clearing one number of an existing reading leaves half a reading.
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'bp1_diastolic': None},
                                           format='json').status_code, 400)

    def test_scope_and_permissions(self):
        pk = self.create_exam().data['id']
        other = Organization.objects.create(name='Other', slug='other')
        other_patient = create_patient(other, full_name='Other Patient', date_of_birth=date(1970, 1, 1))
        self.assertEqual(self.create_exam(patient=str(other_patient.pk)).status_code, 400)
        another = create_patient(self.clinic, full_name='Another Patient', date_of_birth=date(1985, 1, 1))
        self.assertEqual(self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'patient': str(another.pk)},
                                           format='json').status_code, 400)
        self.assertEqual(self.client.get(URL).status_code, 400)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL, {'patient': str(self.patient.pk)}).status_code, 403)
        self.assertEqual(self.create_exam().status_code, 403)
        outsider = make_member(other, 'outside@example.com', OrganizationMember.Role.OWNER)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(f'{URL}{pk}/').status_code, 404)
        self.assertEqual(self.client.get(URL, {'patient': str(self.patient.pk)}).data['results'], [])

    def test_failed_revision_rolls_back_the_update(self):
        pk = self.create_exam().data['id']
        with patch('product.records.views.ExaminationViewSet._save_revision', side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):
                self.client.patch(f'{URL}{pk}/', {'expected_version': 1, 'plan': 'stop'}, format='json')
        self.assertEqual(Examination.objects.get(pk=pk).version, 1)
