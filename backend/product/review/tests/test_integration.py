"""
Cross-package paths with no mocks between the packages: intake answers -> alert rules -> case
routing, the rule-run stamp, the draft-time peanut check, cross-lab comparison wording, and the
per-value check releasing a held case.
"""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from product.alerts.models import PatientAlert
from product.intake.models import IntakeForm
from product.intake.services import issue_form
from product.intake.tests.test_api import menopause_answers
from product.results.tests import pdfs
from product.review.models import ResultsCase, SentEmail
from product.review.services import route_report
from product.review.tasks import send_case_email

from .test_drafting import make_prescription
from .test_review import BASE, ReviewTestCase

EVALUATE = '/api/product/alerts/evaluate/'


def _raise(*args, **kwargs):
    raise RuntimeError('broken rule')


class IntegrationTestCase(ReviewTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()  # the public form's throttle counters
        self.approve('results', '{{results.table}}\n{{prescription}}')

    def complete_form(self, answers=None, shown=None, **fields):
        """A complete catalogue form, as a submit leaves it, before the rules have run."""
        answers = answers or {}
        defaults = dict(organization=self.clinic, patient=self.patient, kind='full', status='complete',
                        token_hash=secrets.token_hex(32), expires_at=timezone.now() + timedelta(days=7),
                        submitted_at=timezone.now(), catalogue_version='1', answers=answers,
                        shown_questions=list(answers) if shown is None else shown)
        return IntakeForm.objects.create(**{**defaults, **fields})

    def evaluate(self):
        response = self.client.post(EVALUATE, {'patient': str(self.patient.pk)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data


class RuleRunStampTests(IntegrationTestCase):
    def test_check_alerts_now_stamps_the_form_and_a_failed_rule_holds_the_case_again(self):
        form = self.complete_form({'self_harm': 0})
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        # Routing runs the rules and records the clean run on the form.
        self.assertEqual((case.status, case.flag_reasons), (ResultsCase.Status.DRAFTED, []))

        self.evaluate()
        form.refresh_from_db()
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [])
        route_report(case.report)
        case.refresh_from_db()
        self.assertEqual(case.status, ResultsCase.Status.DRAFTED)

        # A later run where one rule fails keeps the earlier stamp but records the error.
        with patch.dict('product.alerts.answer_rules.REGISTRY', {'self_harm': _raise}), \
                self.assertLogs('product.alerts.services', level='ERROR'):
            self.evaluate()
        form.refresh_from_db()
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [{'rule': 'R15', 'error': 'RuntimeError'}])
        with patch.dict('product.alerts.answer_rules.REGISTRY', {'self_harm': _raise}),                 self.assertLogs('product.alerts.services', level='ERROR'):
            route_report(case.report)
        case.refresh_from_db()
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['alert_rules_not_checked']))

    def send(self):
        self.approve('results', '{{results.table}}')  # no prescription blank to fill
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            approved = self.client.post(f'{BASE}{case.id}/approve/')
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        return SentEmail.objects.get(case=case)

    def test_the_rules_run_for_real_after_a_send(self):
        sent = self.send()
        form = self.complete_form({'self_harm': 2})  # submitted while the email waited
        with self.captureOnCommitCallbacks(execute=True):
            send_case_email.apply(args=[str(sent.id)])
        form.refresh_from_db()
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [])
        alert = PatientAlert.objects.get(patient=self.patient, rule__code='R15', status='open')
        self.assertEqual(alert.intake_form_id, form.pk)

    def test_a_rule_failing_after_a_send_is_recorded_and_the_email_stays_sent(self):
        sent = self.send()
        form = self.complete_form({'self_harm': 0})
        with patch.dict('product.alerts.answer_rules.REGISTRY', {'self_harm': _raise}), \
                self.assertLogs('product.alerts.services', level='ERROR'), \
                self.captureOnCommitCallbacks(execute=True):
            send_case_email.apply(args=[str(sent.id)])
        sent.refresh_from_db()
        form.refresh_from_db()
        self.assertEqual(sent.status, 'sent')
        self.assertIsNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [{'rule': 'R15', 'error': 'RuntimeError'}])


class PeanutAllergyFromTheFormTests(IntegrationTestCase):
    def choose_prometrium(self, allergy):
        self.complete_form({'peanut_allergy': allergy})
        self.evaluate()  # no progesterone yet, so R11 does not fire and the form is checked
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.status, ResultsCase.Status.DRAFTED, case.flag_reasons)
        prometrium = make_prescription(self.clinic, self.doctor, 'Prometrium', '100 mg', 'At night')
        return self.client.post(f'{BASE}{case.id}/options/', {'prescriptions': [str(prometrium.id)]}, format='json')

    def test_a_peanut_allergy_on_her_form_flags_prometrium(self):
        response = self.choose_prometrium('yes')
        self.assertEqual((response.data['status'], response.data['flag_reasons']),
                         ('drafted', ['peanut_allergy_prometrium']))

    def test_no_allergy_no_flag(self):
        self.assertEqual(self.choose_prometrium('no').data['flag_reasons'], [])


class CrossLabDraftTests(IntegrationTestCase):
    def test_two_labs_compare_with_a_different_lab_note_in_the_draft(self):
        self.approve('follow_up_comparison', '{{comparison.table}}')
        self.read(pdfs.header(collected='03/07/2026') + ['TSH 1.8 mIU/L 0.4 - 4.0'], name='july.pdf')
        later = pdfs.header(collected='03/10/2026') + ['TSH 2.6 mIU/L 0.4 - 4.0']
        later[0] = 'Delta Medical Labs'
        case = self.read(later, name='october.pdf')
        self.assertEqual(case.route, 'follow_up')
        body = self.detail(case)['draft']['body']
        self.assertIn('TSH: 1.8 mIU/L (3 July 2026) → 2.6 mIU/L (3 October 2026) '
                      '(higher, different lab: Nile Diagnostics Laboratory → Delta Medical Labs)', body)


class SubmittedFormToHeldCaseTests(IntegrationTestCase):
    FORM = '/api/product/intake/public/form/'
    VERIFY = '/api/product/intake/public/verify/'

    def submit(self, answers):
        form, token = issue_form(self.clinic, self.patient, 'full')
        session = self.client.post(self.VERIFY, {'token': token, 'date_of_birth': '1974-03-09'},
                                   format='json').data['session']
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.FORM, {'answers': answers}, format='json',
                                        HTTP_X_INTAKE_SESSION=session)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        form.refresh_from_db()
        return form

    def test_red_answers_open_alerts_and_hold_the_next_report(self):
        form = self.submit(menopause_answers(bleed_after_year='yes', self_harm=1))
        self.assertEqual(form.status, IntakeForm.Status.COMPLETE)
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [])
        red = {a.rule.code: a for a in PatientAlert.objects.filter(patient=self.patient, status='open', level='red')}
        self.assertLessEqual({'R7', 'R15'}, set(red))
        self.assertEqual({red['R7'].intake_form_id, red['R15'].intake_form_id}, {form.pk})

        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.status, ResultsCase.Status.FLAGGED)
        self.assertIn('red_alert_open', case.flag_reasons)
        self.assertFalse(case.drafts.filter(is_current=True).exists())
        listed = self.client.get('/api/product/alerts/', {'report': str(case.report_id), 'scope': 'case'}).data
        self.assertLessEqual({'R7', 'R15'}, {a['code'] for a in listed['results']})

    def test_the_form_shows_her_medicines_as_written(self):
        from product.orders.models import Order, PrescribedMedicine

        order = Order.objects.create(organization=self.clinic, patient=self.patient, kind=Order.Kind.PRESCRIPTION,
                                     title='Prescription', delivery=Order.Delivery.PRINT, issued_by=self.doctor)
        PrescribedMedicine.objects.create(order=order, drug="Utrogestan 100mg (St. John's)")
        self.complete_form({'current_medicines': [{'name': 'utrogestan 100MG (st johns)'}, {'name': 'Estrogel'}]})
        _, token = issue_form(self.clinic, self.patient, 'full')
        session = self.client.post(self.VERIFY, {'token': token, 'date_of_birth': '1974-03-09'},
                                   format='json').data['session']
        payload = self.client.get(self.FORM, HTTP_X_INTAKE_SESSION=session).data
        self.assertEqual(payload['current_medicines'], ["Utrogestan 100mg (St. John's)", 'Estrogel'])

    def test_calm_answers_open_no_red_alert(self):
        form = self.submit(menopause_answers())
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertFalse(PatientAlert.objects.filter(patient=self.patient, status='open', level='red').exists())
        self.assertEqual(self.read(pdfs.header() + pdfs.BLOODS[:3]).status, ResultsCase.Status.DRAFTED)


class UncertainValueReleaseTests(IntegrationTestCase):
    def test_checking_the_uncertain_value_releases_the_case_with_a_draft(self):
        case = self.read(pdfs.header() + ['Ferritin 48.0 ng/mL 13 - 150', 'TSH 3.1 mIU/L 0.4 - 4.0 see note'])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['uncertain_value']))
        self.assertFalse(case.drafts.filter(is_current=True).exists())
        tsh = case.report.values.get(lab_test__code='tsh')
        response = self.client.post(f'/api/product/results/values/{tsh.id}/check/', {'ref_text': '0.4 - 4.0'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        case.refresh_from_db()
        self.assertEqual(case.status, ResultsCase.Status.DRAFTED)
        draft = self.detail(case)['draft']
        self.assertIn('TSH', draft['body'])
        self.assertIn('Ferritin', draft['body'])
