from datetime import date, timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization
from product.intake.models import IntakeForm
from product.intake.services import issue_form
from product.patients.services import create_patient
from product.testing import make_member

FORMS = '/api/product/intake/forms/'
OPEN = '/api/product/intake/public/open/'
VERIFY = '/api/product/intake/public/verify/'
FORM = '/api/product/intake/public/form/'
DOB = date(1974, 3, 14)
MRS = [3, 1, 3, 2, 2, 1, 2, 2, 0, 1, 1]


def token_of(link: str) -> str:
    return link.split('#t=')[1]


class PublicIntakeTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=DOB)
        self.form, self.token = issue_form(self.clinic, self.patient, 'followup')

    def session(self):
        response = self.client.post(VERIFY, {'token': self.token, 'date_of_birth': DOB.isoformat()}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data['session']

    def test_opening_shows_only_the_first_name(self):
        response = self.client.post(OPEN, {'token': self.token}, format='json')
        self.assertEqual(response.data['first_name'], 'Laila')
        self.assertNotIn('date_of_birth', response.data)
        self.form.refresh_from_db()
        self.assertIsNotNone(self.form.opened_at)

    def test_unknown_or_expired_link(self):
        self.assertEqual(self.client.post(OPEN, {'token': 'nope'}, format='json').status_code, status.HTTP_410_GONE)
        IntakeForm.objects.filter(pk=self.form.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        response = self.client.post(OPEN, {'token': self.token}, format='json')
        self.assertEqual(response.data['error']['code'], 'LINK_INVALID')

    def test_wrong_birthdays_lock_the_link(self):
        for _ in range(4):
            response = self.client.post(VERIFY, {'token': self.token, 'date_of_birth': '1970-01-01'}, format='json')
            self.assertEqual(response.data['error']['code'], 'DATE_OF_BIRTH_MISMATCH')
        response = self.client.post(VERIFY, {'token': self.token, 'date_of_birth': '1970-01-01'}, format='json')
        self.assertEqual(response.data['error']['code'], 'LINK_LOCKED')
        response = self.client.post(VERIFY, {'token': self.token, 'date_of_birth': DOB.isoformat()}, format='json')
        self.assertEqual(response.status_code, status.HTTP_410_GONE)
        self.assertTrue(AuditLog.objects.filter(action='intake.verify_failed').exists())

    def test_form_needs_a_session(self):
        self.assertEqual(self.client.get(FORM).status_code, status.HTTP_410_GONE)
        self.assertEqual(self.client.get(FORM, HTTP_X_INTAKE_SESSION='forged').status_code, status.HTTP_410_GONE)

    def test_save_later_then_submit(self):
        headers = {'HTTP_X_INTAKE_SESSION': self.session()}
        response = self.client.patch(FORM, {'answers': {'overall': 'better', 'unknown': 'dropped'}}, format='json',
                                     **headers)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertEqual(response.data['answers'], {'overall': 'better'})

        response = self.client.post(FORM, {'answers': {'overall': 'better', 'side_effects': ['breast']}}, format='json',
                                    **headers)
        self.assertEqual(response.data['error']['code'], 'MRS_REQUIRED')

        response = self.client.post(FORM, {'answers': {'overall': 'better'}, 'mrs': MRS}, format='json', **headers)
        self.assertEqual(response.data['status'], 'complete')
        self.form.refresh_from_db()
        self.assertEqual(self.form.mrs_total, 18)
        self.assertEqual(self.form.mrs_groups, {'somatic': 8, 'psychological': 7, 'urogenital': 3})
        again = self.client.patch(FORM, {'answers': {}}, format='json', **headers)
        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)

    def test_rejects_bad_scores(self):
        headers = {'HTTP_X_INTAKE_SESSION': self.session()}
        response = self.client.patch(FORM, {'mrs': [5] * 11}, format='json', **headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_link_ends_the_old_link_and_session(self):
        session = self.session()
        _, new_token = issue_form(self.clinic, self.patient, 'followup', appointment=None)
        # issue_form without an appointment starts a separate form; rotating replaces this one's link.
        from product.intake.services import rotate_link

        rotate_link(self.form, delivery='copied')
        self.assertEqual(self.client.post(OPEN, {'token': self.token}, format='json').status_code, status.HTTP_410_GONE)
        self.assertEqual(self.client.get(FORM, HTTP_X_INTAKE_SESSION=session).status_code, status.HTTP_410_GONE)
        self.assertEqual(self.client.post(OPEN, {'token': new_token}, format='json').status_code, status.HTTP_200_OK)


class StaffIntakeTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.client.force_authenticate(make_member(self.clinic, 'reception@example.com'))
        self.patient = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=DOB)

    def test_issue_copy_and_read_answers(self):
        response = self.client.post(FORMS, {'patient': str(self.patient.pk), 'kind': 'followup'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        first = token_of(response.data['link'])
        form_id = response.data['form']['id']
        self.assertEqual(response.data['form']['sent_via'], 'copied')

        copied = self.client.post(f'{FORMS}{form_id}/link/')
        self.assertNotEqual(token_of(copied.data['link']), first)
        self.assertEqual(copied.data['form']['sent_via'], 'copied')

        IntakeForm.objects.filter(pk=form_id).update(status='complete', mrs=MRS, mrs_total=18,
                                                     submitted_at=timezone.now(), answers={'overall': 'better'})
        detail = self.client.get(f'{FORMS}{form_id}/')
        self.assertEqual(detail.data['answers'], {'overall': 'better'})
        self.assertTrue(AuditLog.objects.filter(action='intake.opened', resource_id=form_id).exists())
        self.assertEqual(self.client.post(f'{FORMS}{form_id}/link/').status_code, status.HTTP_409_CONFLICT)

        history = self.client.get(f'{FORMS}mrs/', {'patient': str(self.patient.pk)})
        self.assertEqual([p['total'] for p in history.data], [18])

    def test_email_needs_an_address(self):
        response = self.client.post(FORMS, {'patient': str(self.patient.pk), 'send_email': True}, format='json')
        self.assertEqual(response.data['error']['code'], 'NO_RECIPIENT')


class CorsTests(APITestCase):
    def test_session_header_is_allowed_cross_origin(self):
        response = self.client.options(FORM, HTTP_ORIGIN='http://localhost:3100',
                                       HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
                                       HTTP_ACCESS_CONTROL_REQUEST_HEADERS='x-intake-session')
        self.assertIn('x-intake-session', response.get('Access-Control-Allow-Headers', '').lower())
