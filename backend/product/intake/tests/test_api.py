from datetime import date, timedelta
from unittest import mock

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
        medicines = mock.patch('product.medicines.current_medicine_names', return_value=[])
        medicines.start()
        self.addCleanup(medicines.stop)
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

        response = self.client.post(FORM, {'answers': {'overall': 'better', 'adherence': 'yes'}, 'mrs': MRS}, format='json', **headers)
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

    def test_a_body_over_the_limit_is_refused_before_it_is_read(self):
        with self.settings(INTAKE_MAX_BODY_BYTES=1000):
            response = self.client.post(OPEN, {'token': 'x' * 2000}, format='json')
            self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
            self.assertEqual(response.data['error']['code'], 'REQUEST_TOO_LARGE')
            response = self.client.patch(FORM, {'answers': {'notes': 'x' * 2000}}, format='json',
                                         HTTP_X_INTAKE_SESSION='forged')
            self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
            self.assertEqual(self.client.post(OPEN, {'token': self.token}, format='json').status_code,
                             status.HTTP_200_OK)

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


PART_A_NO = {'hs_breast_cancer': 'no', 'hs_coronary': 'no', 'hs_stroke': 'no', 'hs_vte': 'no',
             'hs_unexplained_bleeding': 'no', 'hs_liver': 'no', 'hs_cancer_treatment': 'none'}
MOOD = {'phq2_interest': 0, 'phq2_down': 1, 'gad2_nervous': 0, 'gad2_worry': 0, 'self_harm': 0}
STOPPED = {'period_status': 'stopped', 'bleed_after_year': 'no', 'menopause_age': 51,
           'how_periods_stopped': 'natural', 'uterus': 'yes', 'ovaries': 'both'}


def menopause_answers(**changes):
    answers = {'reasons': ['meno'], **STOPPED, **PART_A_NO, **MOOD}
    answers.update(changes)
    return {k: v for k, v in answers.items() if v is not None}


def age_today() -> int:
    today = timezone.localdate()
    return today.year - DOB.year - ((today.month, today.day) < (DOB.month, DOB.day))


@mock.patch('product.medicines.current_medicine_names', return_value=['utrogestan 100 mg'])
class FullFormTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=DOB)
        self.form, token = issue_form(self.clinic, self.patient, 'full')
        response = self.client.post(VERIFY, {'token': token, 'date_of_birth': DOB.isoformat()}, format='json')
        self.headers = {'HTTP_X_INTAKE_SESSION': response.data['session']}

    def submit(self, answers):
        return self.client.post(FORM, {'answers': answers}, format='json', **self.headers)

    def test_payload_serves_the_catalogue(self, _medicines):
        response = self.client.get(FORM, **self.headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sections = {s['id']: s for s in response.data['catalogue']['sections']}
        self.assertIn('hormone_screen', sections)
        self.assertIn('opens_when', sections['menopause'])
        self.assertEqual(response.data['patient_age'], age_today())
        self.assertEqual(response.data['current_medicines'], ['utrogestan 100 mg'])
        self.assertEqual(response.data['previous_answers'], {})

    def test_stopped_without_bleeding_after_a_year_is_refused(self, _medicines):
        response = self.submit(menopause_answers(bleed_after_year=None))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'ANSWERS_INCOMPLETE')
        self.assertIn('bleed_after_year', response.data['error']['fields'])
        self.form.refresh_from_db()
        self.assertNotEqual(self.form.status, IntakeForm.Status.COMPLETE)

    def test_submit_without_periods_now_is_refused(self, _medicines):
        response = self.submit(menopause_answers(period_status=None))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'ANSWERS_INCOMPLETE')
        self.assertIn('period_status', response.data['error']['fields'])

    def test_stopped_without_the_bleeding_and_uterus_answers_is_refused(self, _medicines):
        answers = {'reasons': ['other'], 'period_status': 'stopped'}
        response = self.submit(answers)
        self.assertEqual(response.data['error']['code'], 'ANSWERS_INCOMPLETE')
        for field in ('bleed_after_year', 'uterus'):
            self.assertIn(field, response.data['error']['fields'])

    def test_not_sure_for_age_at_menopause_is_accepted(self, _medicines):
        response = self.submit(menopause_answers(menopause_age='not_sure'))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.form.refresh_from_db()
        self.assertEqual(self.form.answers['menopause_age'], 'not_sure')

    def test_a_blank_part_a_item_on_a_menopause_form_is_refused(self, _medicines):
        response = self.submit(menopause_answers(hs_vte=None))
        self.assertEqual(response.data['error']['code'], 'ANSWERS_INCOMPLETE')
        self.assertEqual(list(response.data['error']['fields']), ['hs_vte'])

    def test_the_mood_questions_are_required(self, _medicines):
        response = self.submit(menopause_answers(self_harm=None))
        self.assertEqual(list(response.data['error']['fields']), ['self_harm'])

    def test_invalid_answers_are_refused(self, _medicines):
        response = self.client.patch(FORM, {'answers': {'smoking': 'sometimes'}}, format='json', **self.headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_answers_to_hidden_questions_are_not_stored(self, _medicines):
        with mock.patch('product.alerts.services.evaluate_patient_safely', create=True) as evaluate, \
                self.captureOnCommitCallbacks(execute=True):
            response = self.submit(menopause_answers(pregnant='yes', desire_bother='a_lot'))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.form.refresh_from_db()
        self.assertNotIn('pregnant', self.form.answers)
        self.assertNotIn('desire_bother', self.form.answers)  # low_desire was not answered yes
        self.assertNotIn('pregnant', self.form.shown_questions)
        self.assertIn('bleed_after_year', self.form.shown_questions)
        self.assertEqual(self.form.catalogue_version, '1')
        evaluate.assert_called_once()
        patient, form = evaluate.call_args.args
        self.assertEqual((patient.pk, form.pk), (self.patient.pk, self.form.pk))

    def test_submit_succeeds_when_the_rules_fail(self, _medicines):
        with mock.patch('product.alerts.services.evaluate_patient_safely', create=True,
                        side_effect=RuntimeError('boom')), \
                self.assertLogs('product.intake.services', level='ERROR'), \
                self.captureOnCommitCallbacks(execute=True):
            response = self.submit(menopause_answers())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.form.refresh_from_db()
        self.assertEqual(self.form.status, IntakeForm.Status.COMPLETE)
        self.assertIsNone(self.form.rules_evaluated_at)
        self.assertEqual(len(self.form.rule_errors), 1)

    def test_submit_reroutes_open_cases_after_the_rules(self, _medicines):
        # reroute_open_cases lives in product.review.services; patched (create=True) so this test
        # passes whether or not it exists yet.
        calls = mock.Mock()
        with (mock.patch('product.alerts.services.evaluate_patient_safely', create=True,
                         side_effect=lambda *a: calls.evaluate()),
              mock.patch('product.review.services.reroute_open_cases', create=True,
                         side_effect=lambda p: calls.reroute(p.pk)),
              self.captureOnCommitCallbacks(execute=True)):
            response = self.submit(menopause_answers())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(calls.mock_calls, [mock.call.evaluate(), mock.call.reroute(self.patient.pk)])

    def test_a_failing_reroute_does_not_fail_the_submit(self, _medicines):
        with (mock.patch('product.alerts.services.evaluate_patient_safely', create=True),
              mock.patch('product.review.services.reroute_open_cases', create=True,
                         side_effect=RuntimeError('boom')),
              self.assertLogs('product.intake.services', level='ERROR'),
              self.captureOnCommitCallbacks(execute=True)):
            response = self.submit(menopause_answers())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.form.refresh_from_db()
        self.assertEqual(self.form.status, IntakeForm.Status.COMPLETE)

    def test_an_emptied_list_is_saved_read_back_and_clears_the_history(self, _medicines):
        from product.intake.history import patient_history

        IntakeForm.objects.create(
            organization=self.clinic, patient=self.patient, kind='full', status=IntakeForm.Status.COMPLETE,
            token_hash='old', expires_at=timezone.now(), submitted_at=timezone.now() - timedelta(days=90),
            answers={'fh_vte': [{'relative': 'mother'}]}, shown_questions=['fh_vte'])
        saved = self.client.patch(FORM, {'answers': {'fh_vte': []}}, format='json', **self.headers)
        self.assertEqual(saved.data['answers'], {'fh_vte': None})
        reopened = self.client.get(FORM, **self.headers).data
        self.assertEqual(reopened['answers'], {'fh_vte': None})  # the form does not fill it in again
        with (mock.patch('product.alerts.services.evaluate_patient_safely', create=True),
              mock.patch('product.review.services.reroute_open_cases', create=True),
              self.captureOnCommitCallbacks(execute=True)):
            response = self.submit({**menopause_answers(), 'fh_vte': None})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.form.refresh_from_db()
        self.assertIn('fh_vte', self.form.shown_questions)
        self.assertIsNone(patient_history(self.patient).merged('fh_vte'))

    def test_previous_answers_carry_forward_history_only(self, _medicines):
        IntakeForm.objects.create(
            organization=self.clinic, patient=self.patient, kind='full', status=IntakeForm.Status.COMPLETE,
            token_hash='old', expires_at=timezone.now(), submitted_at=timezone.now() - timedelta(days=90),
            answers={'current_medicines': [{'name': 'Estrogel'}], 'fh_vte': [{'relative': 'mother'}],
                     'self_harm': 1, 'phq2_down': 2, 'pregnant': 'no', 'smoking': 'ex'},
            shown_questions=['current_medicines', 'fh_vte', 'self_harm', 'phq2_down', 'pregnant', 'smoking'])
        previous = self.client.get(FORM, **self.headers).data['previous_answers']
        self.assertEqual(previous, {'current_medicines': [{'name': 'Estrogel'}], 'fh_vte': [{'relative': 'mother'}],
                                    'smoking': 'ex'})


class SummaryTests(APITestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.client.force_authenticate(make_member(self.clinic, 'doctor@example.com'))
        self.patient = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=DOB)

    def complete(self, answers, shown):
        form, _ = issue_form(self.clinic, self.patient, 'full')
        IntakeForm.objects.filter(pk=form.pk).update(status='complete', submitted_at=timezone.now(), answers=answers,
                                                     shown_questions=shown)
        return form

    def summary(self, form):
        response = self.client.get(f'{FORMS}{form.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row['question']: {**row, 'module': module['module']}
                for module in response.data['history_summary'] for row in module['rows']}

    def test_part_a_prefer_to_discuss_is_highlighted(self):
        form = self.complete({'reasons': ['meno'], 'hs_vte': 'discuss', 'hs_liver': 'no'},
                             ['reasons', 'hs_vte', 'hs_liver', 'hs_stroke', 'notes'])
        rows = self.summary(form)
        self.assertEqual(rows['hs_vte']['value'], 'Prefer to discuss with the doctor')
        self.assertTrue(rows['hs_vte']['highlight'])
        self.assertEqual(rows['hs_vte']['module'], 'hormone_screen')
        self.assertFalse(rows['hs_liver']['highlight'])
        # A shown red-rule question left blank is "not answered" and highlighted.
        self.assertTrue(rows['hs_stroke']['not_answered'])
        self.assertTrue(rows['hs_stroke']['highlight'])
        # A blank question that feeds no rule is left out.
        self.assertNotIn('notes', rows)

    def test_values_use_the_catalogue_labels(self):
        form = self.complete({'reasons': ['meno', 'dis'], 'smoking': 'current', 'menopause_age': 'not_sure',
                              'fh_breast_cancer': [{'relative': 'mother', 'age': 45}]},
                             ['reasons', 'smoking', 'menopause_age', 'fh_breast_cancer'])
        rows = self.summary(form)
        self.assertEqual(rows['reasons']['value'], 'Menopause symptoms (flushes, sleep, mood), Discharge or infection')
        self.assertEqual(rows['smoking']['value'], 'Current')
        self.assertTrue(rows['smoking']['highlight'])
        self.assertEqual(rows['menopause_age']['value'], 'Not sure')
        self.assertEqual(rows['fh_breast_cancer']['value'], 'Mother, 45')
        self.assertTrue(rows['fh_breast_cancer']['highlight'])

    def test_legacy_form_summarises_what_it_holds(self):
        form = self.complete({'period_status': 'stopped', 'bleed_after_year': 'yes'}, [])
        rows = self.summary(form)
        self.assertEqual(set(rows), {'period_status', 'bleed_after_year'})
        self.assertTrue(rows['bleed_after_year']['highlight'])

    def test_detail_returns_the_rule_run(self):
        form = self.complete({}, [])
        IntakeForm.objects.filter(pk=form.pk).update(rule_errors=[{'rule': 'R7', 'error': 'x'}])
        detail = self.client.get(f'{FORMS}{form.pk}/').data
        self.assertIsNone(detail['rules_evaluated_at'])
        self.assertEqual(detail['rule_errors'], [{'rule': 'R7', 'error': 'x'}])

    def test_staff_can_add_modules(self):
        response = self.client.post(FORMS, {'patient': str(self.patient.pk), 'extra_modules': ['breast', 'menopause']},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        form = IntakeForm.objects.get(pk=response.data['form']['id'])
        self.assertEqual(form.extra_modules, ['breast', 'menopause'])
        bad = self.client.post(FORMS, {'patient': str(self.patient.pk), 'extra_modules': ['details']}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
