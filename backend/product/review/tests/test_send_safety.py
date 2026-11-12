"""
What stops a results email at the moment of sending, and what re-routes a case: unchecked values,
red alerts opened after drafting, rules that could not be checked, closed cases, sender text.
"""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status

from product.alerts.models import PatientAlert
from product.content.models import AlertRule
from product.results.tests import pdfs
from product.review.models import ResultsCase, SentEmail
from product.review.services import ReviewError, open_reply_case, rebuild, reroute_open_cases, route_report

from .test_drafting import make_prescription
from .test_review import BASE, ReviewTestCase

UNSURE_TSH = 'TSH 3.1 mIU/L 0.4 - 4.0 see note'


class SendSafetyTestCase(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}')

    def form(self, **fields):
        from product.intake.models import IntakeForm

        defaults = dict(organization=self.clinic, patient=self.patient, kind='full', status='complete',
                        token_hash=secrets.token_hex(32), expires_at=timezone.now() + timedelta(days=7),
                        submitted_at=timezone.now(), catalogue_version='1', rules_evaluated_at=timezone.now())
        return IntakeForm.objects.create(**{**defaults, **fields})

    def manual_rules(self, count=1):
        """Rules with no automatic check, so the evaluations run while routing leave their alerts alone."""
        rules = [r for r in AlertRule.objects.filter(organization=self.clinic).order_by('code')
                 if r.current and not r.current.answer_check and not r.current.lab_check]
        return rules[:count]

    def red_answer_alert(self, rule=None):
        rule = rule or self.manual_rules()[0]
        return PatientAlert.objects.create(organization=self.clinic, patient=self.patient, rule=rule,
                                           rule_version=rule.current, level='red', message=rule.current.message,
                                           intake_form=self.form())

    def post(self, case, path, payload=None):
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f'{BASE}{case.id}/{path}', payload or {}, format='json')


class UncheckedValueTests(SendSafetyTestCase):
    def test_draft_anyway_cannot_skip_an_uncertain_value_and_approve_refuses_it(self):
        # The verifier's reproduction: draft anyway, then approve, sent the unchecked value.
        case = self.read(pdfs.header() + [UNSURE_TSH])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['uncertain_value']))
        anyway = self.post(case, 'draft-anyway/', {'reason': 'Looks fine'})
        self.assertEqual((anyway.status_code, anyway.data['error']['code']), (409, 'values_need_check'))
        case.refresh_from_db()
        self.assertEqual(case.status, 'flagged')
        self.assertFalse(case.actions.filter(action='drafted_anyway').exists())
        self.assertEqual(self.post(case, 'approve/').status_code, 409)
        self.assertFalse(SentEmail.objects.exists())

        # The way out: the doctor checks the value; the case is then drafted.
        tsh = case.report.values.get(lab_test__code='tsh')
        checked = self.client.post(f'/api/product/results/values/{tsh.id}/check/', {}, format='json')
        self.assertEqual(checked.status_code, status.HTTP_200_OK, checked.data)
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')
        self.assertEqual(self.post(case, 'approve/').status_code, status.HTTP_200_OK)

    def test_approve_refuses_a_value_marked_uncertain_after_drafting(self):
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.status, 'drafted')
        case.report.values.filter(lab_test__code='ferritin').update(needs_check=True, check_reason='ref_leftover')
        refused = self.post(case, 'approve/')
        self.assertEqual((refused.status_code, refused.data['error']['code']), (409, 'values_need_check'))
        self.assertFalse(SentEmail.objects.exists())

    def test_an_unreadable_value_needs_the_doctors_check_not_draft_anyway(self):
        case = self.read(pdfs.header() + pdfs.BLOODS[:3] + ['Vitamin D   ?? ng/mL'])
        self.assertEqual(case.flag_reasons, ['unreadable_value'])
        anyway = self.post(case, 'draft-anyway/', {'reason': 'Vitamin D not needed'})
        self.assertEqual(anyway.data['error']['code'], 'values_need_check')

        vitamin_d = case.report.values.get(unreadable=True)
        self.client.post(f'/api/product/results/values/{vitamin_d.id}/check/', {}, format='json')
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')
        self.assertIn('Vitamin D: could not be read', case.current_draft.body)
        self.assertEqual(self.post(case, 'approve/').status_code, status.HTTP_200_OK)


class RedAlertAtSendTests(SendSafetyTestCase):
    def test_a_red_answer_alert_opened_after_drafting_blocks_sending_until_acknowledged(self):
        # The verifier's reproduction: the alert opened after the draft did not stop the send.
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.status, 'drafted')
        alert = self.red_answer_alert()
        refused = self.post(case, 'approve/')
        self.assertEqual((refused.status_code, refused.data['error']['code']), (409, 'red_alert_open'))
        self.assertEqual(refused.data['error']['context'], {'alerts': [str(alert.id)]})
        self.assertFalse(SentEmail.objects.exists())

        acknowledged = self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'Discussed'},
                                        format='json')
        self.assertEqual(acknowledged.status_code, status.HTTP_200_OK, acknowledged.data)
        self.assertEqual(self.post(case, 'approve/').status_code, status.HTTP_200_OK)

    def test_draft_anyway_covers_alerts_open_before_it_but_not_after(self):
        first, second = self.manual_rules(2)
        self.red_answer_alert(first)
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.flag_reasons, ['red_alert_open'])
        self.assertEqual(self.post(case, 'draft-anyway/', {'reason': 'Seen in clinic'}).data['status'], 'drafted')

        later = self.red_answer_alert(second)
        refused = self.post(case, 'approve/')
        self.assertEqual(refused.data['error']['code'], 'red_alert_open')
        self.assertEqual(refused.data['error']['context'], {'alerts': [str(later.id)]})
        case.refresh_from_db()
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['red_alert_open']))
        self.client.post(f'/api/product/alerts/{later.id}/acknowledge/', {'reason': 'Discussed'}, format='json')
        self.assertEqual(self.post(case, 'approve/').status_code, status.HTTP_200_OK)

    def test_open_cases_are_routed_again_and_keep_an_unchanged_draft(self):
        drafted = self.read(pdfs.header() + pdfs.BLOODS[:3])
        body = drafted.current_draft.body + '\nEdited by the doctor.'
        self.client.patch(f'{BASE}{drafted.id}/draft/', {'body': body}, format='json')

        reroute_open_cases(self.patient)  # nothing changed: the edited draft stays
        drafted.refresh_from_db()
        self.assertEqual((drafted.status, drafted.current_draft.body), ('drafted', body))

        alert = self.red_answer_alert()
        reroute_open_cases(self.patient)
        drafted.refresh_from_db()
        self.assertEqual((drafted.status, drafted.flag_reasons), ('flagged', ['red_alert_open']))

        # F3: acknowledging an answer alert (no report) releases the held case, with the edited draft.
        self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'Discussed'}, format='json')
        drafted.refresh_from_db()
        self.assertEqual((drafted.status, drafted.current_draft.body), ('drafted', body))

    def test_rerouting_never_raises_and_never_reopens_a_closed_case(self):
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.client.post(f'{BASE}{case.id}/reject/', {'reason': 'Phoned'}, format='json')
        self.red_answer_alert()
        reroute_open_cases(self.patient)
        case.refresh_from_db()
        self.assertEqual(case.status, 'rejected')
        with patch('product.review.services._reroute', side_effect=RuntimeError):
            other = self.read(pdfs.header(collected='04/10/2026') + pdfs.BLOODS[:2], name='second.pdf')
            reroute_open_cases(self.patient)  # logged, not raised
        self.assertEqual(ResultsCase.objects.get(pk=other.pk).status, 'flagged')


class RuleErrorTests(SendSafetyTestCase):
    def test_a_throwing_lab_rule_flags_the_case_for_a_patient_without_a_form(self):
        with patch('product.alerts.services._fires', side_effect=ValueError('broken rule')):
            case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['alert_rules_not_checked']))

    def test_a_throwing_rule_is_stamped_on_the_form_and_blocks_sending(self):
        form = self.form()
        with patch('product.alerts.services._fires', side_effect=ValueError('broken rule')):
            case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        form.refresh_from_db()
        self.assertTrue(form.rule_errors)
        self.assertIn('alert_rules_not_checked', case.flag_reasons)

    def test_a_checked_value_runs_the_rules_even_when_the_case_is_closed(self):
        case = self.read(pdfs.header() + [UNSURE_TSH])
        self.client.post(f'{BASE}{case.id}/reject/', {'reason': 'Phoned'}, format='json')
        tsh = case.report.values.get(lab_test__code='tsh')
        with patch('product.alerts.services.evaluate_patient_safely') as evaluate:
            self.client.post(f'/api/product/results/values/{tsh.id}/check/', {}, format='json')
        evaluate.assert_called_with(self.patient, exclude_case=case.pk)


class ClosedCaseTests(SendSafetyTestCase):
    def setUp(self):
        super().setUp()
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])

    def test_no_change_is_accepted_on_a_case_that_is_sending_sent_or_rejected(self):
        for closed in ('sending', 'sent', 'rejected'):
            ResultsCase.objects.filter(pk=self.case.pk).update(status=closed)
            with self.subTest(status=closed):
                for path, payload in (('options/', {'follow_up': 'Repeat in 3 months'}),
                                      ('translations/', {'key': 'results', 'subject': 's', 'body': 'b'})):
                    response = self.client.post(f'{BASE}{self.case.id}/{path}', payload, format='json')
                    self.assertEqual((response.status_code, response.data['error']['code']), (409, 'not_editable'))
                edited = self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': 'x'}, format='json')
                self.assertEqual(edited.status_code, 409)
                self.assertEqual(ResultsCase.objects.get(pk=self.case.pk).status, closed)
        self.assertEqual(self.case.drafts.count(), 1)

    def test_a_stale_copy_of_the_case_cannot_overwrite_a_send_in_flight(self):
        ResultsCase.objects.filter(pk=self.case.pk).update(status=ResultsCase.Status.SENDING)
        with self.assertRaises(ReviewError) as refused:
            rebuild(self.case, user=self.doctor, follow_up='x')  # the in-memory case still says "drafted"
        self.assertEqual(refused.exception.code, 'not_editable')
        self.assertEqual(ResultsCase.objects.get(pk=self.case.pk).status, ResultsCase.Status.SENDING)
        route_report(self.case.report)
        self.assertEqual(ResultsCase.objects.get(pk=self.case.pk).status, ResultsCase.Status.SENDING)


class SenderTextTests(SendSafetyTestCase):
    def test_sender_text_is_never_read_as_a_placeholder_or_a_blank(self):
        from product.mail.models import MailMessage, MailThread

        self.approve('prescription_reply', 'Dear {{patient.first_name}},\nYou asked: {{patient.question}}\n'
                     '{{follow_up}}', subject='Re: question')
        thread = MailThread.objects.create(organization=self.clinic, patient=self.patient,
                                           contact_email='laila@example.com', last_message_at=timezone.now())
        message = MailMessage.objects.create(
            organization=self.clinic, thread=thread, direction='in', status='received', message_id='<q@example.com>',
            from_address='laila@example.com', subject='Question', sent_at=timezone.now(),
            body_text='What is {{results.table}} and [[x]] in my medicine?')
        case = open_reply_case(message)
        draft = case.current_draft
        self.assertNotIn('{{results.table}}', draft.body)
        self.assertIn('results.table', draft.body)
        self.assertEqual(draft.open_slots, [])

        options = self.post(case, 'options/', {'follow_up': 'Book {{clinic.phone}} [[y]]'})
        self.assertEqual(options.data['draft']['open_slots'], [])
        edited = self.client.patch(f'{BASE}{case.id}/draft/', {'body': options.data['draft']['body'] + '\nThanks'},
                                   format='json')
        draft = edited.data['draft']
        self.assertEqual(draft['open_slots'], [])
        self.assertNotIn('Ferritin', draft['body'])
        self.assertNotIn('+20 2 0000 0000', draft['body'])
        self.assertEqual(self.post(case, 'approve/').status_code, status.HTTP_200_OK)


class SectionWithoutPrescriptionTests(SendSafetyTestCase):
    def test_a_picked_drug_with_no_placeholder_in_the_section_leaves_a_blank(self):
        self.approve('sti_opening', 'Dear {{patient.first_name}},', subject='Your swab results')
        self.approve('sti_section_chlamydia', '{{result.name}} was {{result.value}}.')
        self.approve('sti_closing', 'Best wishes')
        case = self.read(pdfs.header() + pdfs.STI)
        drug = make_prescription(self.clinic, self.doctor, 'Example antibiotic', '1 g')
        response = self.post(case, 'options/', {'section_prescriptions': {'sti_section_chlamydia': [str(drug.id)]}})
        draft = response.data['draft']
        self.assertIn('[[Add the prescription to this section: Example antibiotic]]', draft['body'])
        self.assertEqual(draft['open_slots'], ['Add the prescription to this section: Example antibiotic'])
        self.assertEqual(self.post(case, 'approve/').data['error']['code'], 'open_slots')


class HeldCaseTests(SendSafetyTestCase):
    """N1: a block found at sending, or by any rule run, puts the case where the doctor can act on it."""

    def setUp(self):
        super().setUp()
        self.form_row = self.form()  # a clean form: the rules ran without errors
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(self.case.status, 'drafted')
        self.body = self.case.current_draft.body + '\nEdited by the doctor.'
        self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': self.body}, format='json')

    def evaluate(self):
        response = self.client.post('/api/product/alerts/evaluate/', {'patient': str(self.patient.id)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def state(self):
        self.case.refresh_from_db()
        return self.case.status, self.case.flag_reasons

    def test_a_rule_that_starts_failing_holds_the_case_and_a_clean_check_releases_it(self):
        # The reproduction: before, the case stayed "drafted []" and every action was refused.
        with patch('product.alerts.services._fires', side_effect=ValueError('broken rule')):
            self.evaluate()
        self.assertEqual(self.state(), ('flagged', ['alert_rules_not_checked']))
        self.assertEqual(self.post(self.case, 'approve/').data['error']['code'], 'not_ready')

        self.evaluate()  # the rule works again: "Check alerts now"
        self.assertEqual(self.state(), ('drafted', []))
        self.assertEqual(self.case.current_draft.body, self.body)
        self.assertEqual(self.post(self.case, 'approve/').status_code, status.HTTP_200_OK)
        self.assertEqual(SentEmail.objects.get(case=self.case).body, self.body)

    def test_draft_anyway_after_the_hold_keeps_the_draft_and_sends(self):
        with patch('product.alerts.services._fires', side_effect=ValueError('broken rule')):
            self.evaluate()
        anyway = self.post(self.case, 'draft-anyway/', {'reason': 'Rule broken; checked by hand'})
        self.assertEqual(anyway.status_code, status.HTTP_200_OK, anyway.data)
        self.assertEqual((anyway.data['status'], anyway.data['draft']['body']), ('drafted', self.body))
        self.assertEqual(self.post(self.case, 'approve/').status_code, status.HTTP_200_OK)

    def test_approve_refused_by_unchecked_rules_holds_the_case_in_the_same_step(self):
        # Rule errors recorded by a path that did not route the case (the backstop).
        type(self.form_row).objects.filter(pk=self.form_row.pk).update(
            rule_errors=[{'rule': 'R23', 'error': 'ValueError'}], updated_at=timezone.now())
        refused = self.post(self.case, 'approve/')
        self.assertEqual((refused.status_code, refused.data['error']['code']), (409, 'alert_rules_not_checked'))
        self.assertIn('Draft anyway', refused.data['error']['message'])
        self.assertFalse(SentEmail.objects.exists())
        self.assertEqual(self.state(), ('flagged', ['alert_rules_not_checked']))
        self.assertEqual(self.case.current_draft.body, self.body)
        self.assertEqual(self.post(self.case, 'draft-anyway/', {'reason': 'Checked'}).data['status'], 'drafted')
        self.assertEqual(self.post(self.case, 'approve/').status_code, status.HTTP_200_OK)

    def test_a_red_alert_found_by_check_alerts_now_holds_the_case_until_acknowledged(self):
        alert = self.red_answer_alert()
        self.evaluate()
        self.assertEqual(self.state(), ('flagged', ['red_alert_open']))
        self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'Discussed'}, format='json')
        self.assertEqual(self.state(), ('drafted', []))
        self.assertEqual(self.case.current_draft.body, self.body)
        self.assertEqual(self.post(self.case, 'approve/').status_code, status.HTTP_200_OK)

    def test_options_refused_by_a_red_alert_hold_the_case(self):
        self.red_answer_alert()  # opened by a path that did not route the case
        refused = self.post(self.case, 'options/', {'follow_up': 'Repeat in 3 months'})
        self.assertEqual((refused.status_code, refused.data['error']['code']), (409, 'red_alert_open'))
        self.assertEqual(self.state(), ('flagged', ['red_alert_open']))
        anyway = self.post(self.case, 'draft-anyway/', {'reason': 'Seen'})
        self.assertEqual(anyway.data['draft']['body'], self.body)

    def test_a_clinic_wide_re_run_holds_and_releases_the_patients_cases(self):
        from product.alerts.services import evaluate_clinic

        with patch('product.alerts.services._fires', side_effect=ValueError('broken rule')):
            evaluate_clinic(self.clinic)
        self.assertEqual(self.state(), ('flagged', ['alert_rules_not_checked']))
        evaluate_clinic(self.clinic)
        self.assertEqual(self.state(), ('drafted', []))
