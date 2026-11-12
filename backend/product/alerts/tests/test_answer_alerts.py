"""Answer rules end to end: complete forms in the database, evaluated by evaluate_patient."""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from product.alerts.answer_rules import REGISTRY
from product.alerts.models import PatientAlert
from product.alerts.services import acknowledge, evaluate_clinic, evaluate_patient, evaluate_patient_safely
from product.content.models import AlertRule, AlertRuleVersion
from product.content.versioning import add_version
from product.intake.models import IntakeForm
from product.orders.models import Order
from product.orders.services import issue_order

from .test_alerts import AlertTestCase

DELAY = 'product.alerts.tasks.reevaluate_clinic.delay'


class AnswerAlertTestCase(AlertTestCase):
    def submit(self, answers, *, days_ago=0, shown=None, mrs=None):
        """A complete form submitted `days_ago` days ago that showed `shown` (default: what it answered)."""
        submitted = timezone.now() - timedelta(days=days_ago)
        return IntakeForm.objects.create(
            organization=self.clinic, patient=self.patient, kind=IntakeForm.Kind.FULL,
            status=IntakeForm.Status.COMPLETE, token_hash=secrets.token_hex(32),
            expires_at=submitted + timedelta(days=7), submitted_at=submitted, answers=answers, mrs=mrs,
            catalogue_version='1', shown_questions=list(answers) if shown is None else shown,
        )

    def new_version(self, code, **fields):
        rule = AlertRule.objects.get(organization=self.clinic, code=code)
        return add_version(rule, AlertRuleVersion, fields, user=self.doctor)[0]


class AnswerRuleEvaluationTests(AnswerAlertTestCase):
    def test_a_rule_with_an_answer_check_and_no_lab_check_fires(self):
        form = self.submit({'alcohol_units': 20})
        evaluate_patient(self.patient)
        r23 = self.alerts(status='open')['R23']
        self.assertEqual((r23.intake_form, r23.value, r23.report, r23.level, r23.detail),
                         (form, None, None, 'amber', '20 units/week ≥ 14'))

    def test_an_answer_alert_moves_to_the_newer_form_and_is_not_raised_again_once_acknowledged(self):
        first = self.submit({'bleed_after_year': 'yes'}, days_ago=10)
        evaluate_patient(self.patient)
        alert = self.alerts(status='open')['R7']
        self.assertEqual(alert.intake_form, first)

        second = self.submit({'bleed_after_year': 'yes'}, days_ago=1)
        evaluate_patient(self.patient)
        alert.refresh_from_db()
        self.assertEqual((alert.status, alert.intake_form), ('open', second))

        acknowledge(alert, user=self.doctor, reason='Scan booked')
        evaluate_patient(self.patient)
        self.assertNotIn('R7', self.alerts(status='open'))

        third = self.submit({'bleed_after_year': 'yes'})
        evaluate_patient(self.patient)
        self.assertEqual(self.alerts(status='open')['R7'].intake_form, third)

    def test_an_acute_answer_is_not_read_from_an_older_form(self):
        self.submit({'bleed_after_year': 'yes'}, days_ago=30)
        self.submit({'bleed_after_year': 'no'})
        evaluate_patient(self.patient)
        self.assertNotIn('R7', self.alerts(status='open'))

    def test_a_newer_form_that_showed_the_question_but_left_it_blank_does_not_fire(self):
        self.submit({'bleed_after_year': 'yes'}, days_ago=30)
        self.submit({}, shown=['bleed_after_year'])
        evaluate_patient(self.patient)
        self.assertNotIn('R7', self.alerts(status='open'))

    def test_family_history_is_kept_from_an_older_form_the_newer_one_did_not_ask(self):
        old = self.submit({'fh_vte': [{'relative': 'sister'}]}, days_ago=200)
        self.submit({'alcohol_units': 2})
        evaluate_patient(self.patient)
        self.assertEqual(self.alerts(status='open')['R26'].intake_form, old)

    def test_an_answer_that_no_longer_qualifies_resolves_the_alert(self):
        self.submit({'smoking': 'current'}, days_ago=100)
        evaluate_patient(self.patient)
        self.assertIn('R19', self.alerts(status='open'))
        self.submit({'smoking': 'ex'})
        evaluate_patient(self.patient)
        self.assertEqual(self.alerts()['R19'].status, PatientAlert.Status.RESOLVED)

    def test_raising_the_r23_cut_off_and_checking_the_clinic_resolves_the_alert(self):
        self.submit({'alcohol_units': 18})
        evaluate_patient(self.patient)
        self.assertIn('R23', self.alerts(status='open'))
        self.new_version('R23', threshold_a='21')
        self.assertEqual(evaluate_clinic(self.clinic), 1)
        self.assertEqual(self.alerts()['R23'].status, PatientAlert.Status.RESOLVED)

    def test_prefer_to_discuss_opens_the_red_rule(self):
        form = self.submit({'hs_vte': 'discuss'})
        evaluate_patient(self.patient)
        r4 = self.alerts(status='open')['R4']
        self.assertEqual((r4.level, r4.detail, r4.intake_form), ('red', 'Patient prefers to discuss', form))

    def test_a_check_that_raises_is_recorded_and_the_other_rules_still_run(self):
        form = self.submit({'alcohol_units': 30, 'bleed_after_year': 'yes'})

        def broken(history, version, medicine_names):
            raise RuntimeError('broken check')

        with patch.dict(REGISTRY, {'alcohol_units': broken}), self.assertLogs('product.alerts.services', 'ERROR'):
            evaluate_patient_safely(self.patient, form)
        form.refresh_from_db()
        self.assertEqual(form.rule_errors, [{'rule': 'R23', 'error': 'RuntimeError'}])
        self.assertIsNone(form.rules_evaluated_at)
        self.assertIn('R7', self.alerts(status='open'))
        self.assertNotIn('R23', self.alerts())

        # Fixed: the next run stamps the form and clears the errors.
        evaluate_patient_safely(self.patient)
        form.refresh_from_db()
        self.assertEqual(form.rule_errors, [])
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertIn('R23', self.alerts(status='open'))

    def test_a_broken_check_leaves_its_open_alert_as_it_was(self):
        self.submit({'alcohol_units': 30})
        evaluate_patient(self.patient)
        self.submit({'alcohol_units': 0})

        def broken(history, version, medicine_names):
            raise RuntimeError('broken check')

        errors = []
        with patch.dict(REGISTRY, {'alcohol_units': broken}), self.assertLogs('product.alerts.services', 'ERROR'):
            evaluate_patient(self.patient, errors=errors)
        self.assertEqual(errors, [{'rule': 'R23', 'error': 'RuntimeError'}])
        self.assertEqual(self.alerts()['R23'].status, 'open')

    def test_a_whole_run_that_fails_is_recorded_on_the_latest_form(self):
        form = self.submit({'alcohol_units': 30})
        with patch('product.alerts.services.evaluate_patient', side_effect=RuntimeError('db down')), \
                self.assertLogs('product.alerts.services', 'ERROR'):
            evaluate_patient_safely(self.patient)
        form.refresh_from_db()
        self.assertEqual(form.rule_errors, [{'rule': 'all', 'error': 'RuntimeError'}])

    def test_unreadable_answers_are_recorded_for_every_rule_that_reads_them(self):
        form = self.submit({'alcohol_units': 30})
        with patch('product.intake.history.patient_history', side_effect=RuntimeError('bad answers')), \
                self.assertLogs('product.alerts.services', 'ERROR'):
            evaluate_patient_safely(self.patient, form)
        form.refresh_from_db()
        failed = {e['rule'] for e in form.rule_errors}
        self.assertLessEqual({'R1', 'R23', 'R38'}, failed)
        self.assertTrue(failed.isdisjoint({'R20', 'R39'}))  # lab and vitals rules without medicines still ran
        self.assertIn('R39', self.alerts(status='open'))


class StampTests(AnswerAlertTestCase):
    def test_check_alerts_now_stamps_a_legacy_form(self):
        legacy = self.submit({'bleed_after_year': 'no'}, shown=[])
        legacy.catalogue_version = ''
        legacy.save(update_fields=['catalogue_version'])
        self.assertIsNone(legacy.rules_evaluated_at)
        response = self.client.post('/api/product/alerts/evaluate/', {'patient': str(self.patient.id)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([a['code'] for a in response.data], ['R39'])
        legacy.refresh_from_db()
        self.assertIsNotNone(legacy.rules_evaluated_at)
        self.assertEqual(legacy.rule_errors, [])

    def test_evaluate_clinic_stamps_the_latest_complete_form(self):
        older = self.submit({'smoking': 'never'}, days_ago=50)
        latest = self.submit({'smoking': 'never'}, shown=[])
        IntakeForm.objects.filter(pk=latest.pk).update(rule_errors=[{'rule': 'R19', 'error': 'KeyError'}])
        evaluate_clinic(self.clinic)
        latest.refresh_from_db()
        older.refresh_from_db()
        self.assertIsNotNone(latest.rules_evaluated_at)
        self.assertEqual(latest.rule_errors, [])
        self.assertIsNone(older.rules_evaluated_at)

    def test_check_alerts_now_is_for_the_doctor_and_this_clinic(self):
        url = '/api/product/alerts/evaluate/'
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(url, {'patient': str(self.patient.id)}, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.doctor)
        response = self.client.post(url, {'patient': '00000000-0000-0000-0000-000000000000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MedicineRuleTests(AnswerAlertTestCase):
    def test_r34_needs_a_current_testosterone_medicine(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        self.assertNotIn('R34', self.alerts(status='open'))
        self.prescribe('Testosterone gel 1%')
        evaluate_patient(self.patient)
        r34 = self.alerts(status='open')['R34']
        self.assertEqual(r34.detail, '62 ng/dL > 50; testosterone gel 1')

    def test_r34_from_a_testosterone_row_on_the_form(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        self.submit({'hormones': [{'product': 'Testosterone cream', 'route': 'cream', 'stop': ''}]})
        evaluate_patient(self.patient)
        self.assertIn('R34', self.alerts(status='open'))

    def test_a_stopped_hormone_is_not_a_current_medicine(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        self.submit({'hormones': [{'product': 'Testosterone cream', 'stop': '2025-01-01'}]})
        evaluate_patient(self.patient)
        self.assertNotIn('R34', self.alerts(status='open'))

    def test_issuing_prometrium_to_a_patient_with_a_peanut_allergy_opens_r11(self):
        self.submit({'peanut_allergy': 'yes'})
        with self.captureOnCommitCallbacks(execute=True):
            issue_order(self.clinic, issued_by=self.doctor, patient=self.patient, kind=Order.Kind.PRESCRIPTION,
                        title='HRT', delivery=Order.Delivery.PRINT,
                        medicines=[{'drug': 'Prometrium', 'dose': '100 mg'}])
        r11 = self.alerts(status='open')['R11']
        self.assertEqual((r11.level, r11.detail), ('red', 'prometrium'))

    def test_r32_from_a_curly_apostrophe_supplement(self):
        self.submit({'supplements': [{'name': 'St John’s Wort'}]})
        evaluate_patient(self.patient)
        self.assertIn('R32', self.alerts(status='open'))


class LabAndAnswerRuleTests(AnswerAlertTestCase):
    """A rule carrying both a lab check and an answer check fires when either part fires."""

    def setUp(self):
        super().setUp()
        self.new_version('R34', answer_check='bleeding_after_year', medicine_terms=[])

    def test_the_answer_part_alone_fires(self):
        form = self.submit({'bleed_after_year': 'yes'})
        evaluate_patient(self.patient)
        alert = self.alerts(status='open')['R34']
        self.assertEqual((alert.intake_form, alert.value, alert.detail), (form, None, ''))

    def test_the_lab_part_alone_fires(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        alert = self.alerts(status='open')['R34']
        self.assertEqual((alert.intake_form, alert.value.value_text, alert.detail), (None, '62', '62 ng/dL > 50'))

    def test_both_parts_fire_together_and_neither_clears_it(self):
        form = self.submit({'bleed_after_year': 'yes'})
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        alert = self.alerts(status='open')['R34']
        self.assertEqual((alert.intake_form, alert.detail), (form, '62 ng/dL > 50'))
        self.submit({'bleed_after_year': 'no'})
        self.read(['Testosterone 30 ng/dL 8 - 60'], name='normal.pdf', collected='04/10/2026')
        self.assertEqual(self.alerts()['R34'].status, PatientAlert.Status.RESOLVED)


class CaseScopeTests(AnswerAlertTestCase):
    def test_a_case_shows_its_own_report_and_red_answers_not_newer_reports_or_reminders(self):
        self.prescribe('Testosterone gel')
        old_case = self.read(['Testosterone 62 ng/dL 8 - 60'], name='old.pdf', collected='03/07/2026')
        new_case = self.read(['Testosterone 70 ng/dL 8 - 60'], name='new.pdf', collected='03/10/2026')
        self.submit({'bleed_after_year': 'yes', 'alcohol_units': 30})
        evaluate_patient(self.patient)
        self.assertLessEqual({'R7', 'R23', 'R34', 'R39'}, set(self.alerts(status='open')))

        def codes(report):
            response = self.client.get('/api/product/alerts/', {'scope': 'case', 'report': str(report.id)})
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            return sorted(a['code'] for a in response.data['results'])

        self.assertEqual(codes(old_case.report), ['R7'])
        self.assertEqual(codes(new_case.report), ['R34', 'R7'])
        listed = self.client.get('/api/product/alerts/', {'patient': str(self.patient.id)}).data['results']
        self.assertEqual({a['code']: a['source'] for a in listed if a['code'] in ('R7', 'R34', 'R39')},
                         {'R7': 'answer', 'R34': 'lab', 'R39': 'lab'})


class RuleEditTests(AnswerAlertTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_saving_a_new_r23_cut_off_through_the_api_queues_the_clinic_check(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R23')
        with patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(f'/api/product/content/alert-rules/{rule.id}/', {'threshold_a': '21'},
                                         format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        delay.assert_called_once_with(str(self.clinic.pk))

    def test_a_rule_checked_by_nothing_does_not_sweep(self):
        with patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            self.new_version('R40', threshold_a='6')
        delay.assert_not_called()
