"""Per-infection prescriptions, follow-up text, routing safety, system phrases and reply recipients."""
import secrets
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.core import mail
from django.utils import timezone
from rest_framework import status

from apps.organizations.models import Organization
from product.content.models import (
    AlertRule, AlertRuleVersion, ClinicProfile, EmailTemplateVersion, PrescriptionItem, PrescriptionVersion,
)
from product.content.versioning import add_version
from product.results.comparison import Change, Comparison
from product.results.tests import pdfs
from product.review.models import ResultsCase, SentEmail
from product.review.services import _comparison_line, _Wording, open_reply_case, route_report
from product.review.tasks import send_case_email

from .test_review import BASE, ReviewTestCase


def make_prescription(clinic, user, drug, dose='', directions=''):
    item = PrescriptionItem.objects.create(organization=clinic)
    add_version(item, PrescriptionVersion, {'drug': drug, 'dose': dose, 'directions': directions}, user=user)
    return item


SWAB = ['High vaginal swab - STI screen (PCR)', 'Candida albicans:          Detected',
        'Bacterial vaginosis:       Detected', 'Chlamydia trachomatis:     Not detected']


class SectionPrescriptionTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('sti_opening', 'Dear {{patient.first_name}},\n{{prescription}}', subject='Your swab results')
        for key in ('sti_section_candida', 'sti_section_bacterial_vaginosis'):
            self.approve(key, '{{result.name}}: {{result.value}}.\n{{prescription}}')
        self.approve('sti_closing', '{{follow_up}}\nBest wishes')
        self.candida_drug = make_prescription(self.clinic, self.doctor, 'Example antifungal', '1 pessary')
        self.bv_drug = make_prescription(self.clinic, self.doctor, 'Example antibiotic', '400 mg', 'Twice daily')
        self.case = self.read(pdfs.header() + SWAB)

    def options(self, payload):
        return self.client.post(f'{BASE}{self.case.id}/options/', payload, format='json')

    def picks(self, draft):
        return [(p['section_key'], p['drug']) for p in draft['section_prescriptions']]

    def test_each_infection_section_gets_its_own_drug_kept_through_every_rebuild(self):
        self.assertEqual(self.case.route, 'infection')
        draft = self.detail(self.case)['draft']
        self.assertEqual(draft['open_slots'], ['prescription'])
        self.assertEqual(draft['body'].count('[[prescription]]'), 2)
        # The opening names no drug; the sections follow in test-code order.
        self.assertTrue(draft['body'].startswith('Dear Laila,\n\nBacterial vaginosis: Detected.'), draft['body'])

        one = self.options({'section_prescriptions': {'sti_section_candida': [str(self.candida_drug.id)]}})
        self.assertEqual(one.status_code, status.HTTP_200_OK, one.data)
        self.assertIn('Candida: Detected.\nExample antifungal 1 pessary', one.data['draft']['body'])
        self.assertIn('Bacterial vaginosis: Detected.\n[[prescription]]', one.data['draft']['body'])
        refused = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual(refused.data['error']['code'], 'open_slots')

        both = self.options({'section_prescriptions': {'sti_section_bacterial_vaginosis': [str(self.bv_drug.id)]}})
        draft = both.data['draft']
        bv, candida = draft['body'].split('\n\n')[1:3]
        self.assertEqual(candida, 'Candida: Detected.\nExample antifungal 1 pessary')
        self.assertEqual(bv, 'Bacterial vaginosis: Detected.\nExample antibiotic 400 mg. Twice daily')
        self.assertEqual(draft['open_slots'], [])
        self.assertEqual(sorted(p['drug'] for p in draft['prescriptions']), ['Example antibiotic', 'Example antifungal'])
        expected = [('sti_section_bacterial_vaginosis', 'Example antibiotic'), ('sti_section_candida', 'Example antifungal')]
        self.assertEqual(self.picks(draft), expected)

        # An option change, a language change and reading the report again all keep both picks.
        self.assertEqual(self.picks(self.options({'follow_up': 'Repeat swab in 6 weeks'}).data['draft']), expected)
        arabic = self.options({'language': 'ar'}).data['draft']
        self.assertEqual(self.picks(arabic), expected)
        self.assertTrue(arabic['missing_translations'])
        self.assertEqual(self.picks(self.options({'language': 'en'}).data['draft']), expected)
        route_report(self.case.report)
        reread = self.detail(self.case)['draft']
        self.assertEqual(self.picks(reread), expected)
        self.assertIn('Example antibiotic 400 mg. Twice daily', reread['body'])

        # Clearing one section brings its blank back.
        self.assertEqual(self.options({'section_prescriptions': {'sti_section_candida': []}}).data['draft']['open_slots'],
                         ['prescription'])

    def test_a_translation_save_keeps_the_section_picks(self):
        self.options({'language': 'ar', 'section_prescriptions': {'sti_section_candida': [str(self.candida_drug.id)]}})
        saved = self.client.post(f'{BASE}{self.case.id}/translations/',
                                 {'key': 'sti_closing', 'subject': '§', 'body': '§ {{follow_up}}'}, format='json')
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.data)
        self.assertNotIn('sti_closing', saved.data['draft']['missing_translations'])
        self.assertEqual(self.picks(saved.data['draft']), [('sti_section_candida', 'Example antifungal')])

    def test_section_picks_are_only_for_positive_sections(self):
        wrong = self.options({'section_prescriptions': {'sti_section_chlamydia': [str(self.candida_drug.id)]}})
        self.assertEqual((wrong.status_code, wrong.data['error']['code']), (400, 'invalid_section'))
        flat = self.options({'prescriptions': [str(self.candida_drug.id)]})
        self.assertEqual(flat.data['error']['code'], 'use_section_prescriptions')
        foreign = make_prescription(Organization.objects.create(name='Other', slug='other'), self.doctor, 'Not ours')
        unknown = self.options({'section_prescriptions': {'sti_section_candida': [str(foreign.id)]}})
        self.assertEqual(unknown.status_code, status.HTTP_400_BAD_REQUEST)

    def test_follow_up_goes_where_the_template_asks_with_no_empty_line_otherwise(self):
        self.options({'section_prescriptions': {'sti_section_candida': [str(self.candida_drug.id)],
                                                'sti_section_bacterial_vaginosis': [str(self.bv_drug.id)]}})
        body = self.detail(self.case)['draft']['body']
        self.assertTrue(body.endswith('1 pessary\n\nBest wishes'), body)
        self.assertNotIn('follow_up', body)
        draft = self.options({'follow_up': 'Repeat swab in 6 weeks'}).data['draft']
        self.assertTrue(draft['body'].endswith('1 pessary\n\nRepeat swab in 6 weeks\nBest wishes'), draft['body'])
        self.assertNotIn('Follow-up:', draft['body'])


class FollowUpWithoutPlaceholderTests(ReviewTestCase):
    def test_follow_up_is_added_before_the_signature_when_no_part_asks_for_it(self):
        ClinicProfile.objects.filter(organization=self.clinic).update(signature='Dr Example\nV-Clinic')
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        body = self.client.post(f'{BASE}{case.id}/options/', {'follow_up': 'Repeat bloods in 3 months'},
                                format='json').data['draft']['body']
        self.assertTrue(body.endswith('\n\nFollow-up: Repeat bloods in 3 months\n\nDr Example\nV-Clinic'), body)


class PeanutAllergyTests(ReviewTestCase):
    """R11 at draft time. patient_history is WP-A's; it is patched here with the answer it would give."""

    def setUp(self):
        super().setUp()
        self.approve('results', '{{results.table}}\n{{prescription}}')
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.prometrium = make_prescription(self.clinic, self.doctor, 'Prometrium', '100 mg', 'At night')

    def choose(self, allergy):
        history = SimpleNamespace(merged=lambda qid: allergy if qid == 'peanut_allergy' else None)
        with patch('product.intake.history.patient_history', return_value=history):
            return self.client.post(f'{BASE}{self.case.id}/options/', {'prescriptions': [str(self.prometrium.id)]},
                                    format='json')

    def test_prometrium_for_a_peanut_allergy_is_flagged_but_still_sendable(self):
        response = self.choose('yes')
        self.assertEqual((response.data['status'], response.data['flag_reasons']),
                         ('drafted', ['peanut_allergy_prometrium']))
        drafted = self.case.actions.filter(action='drafted').order_by('-created_at').first()
        self.assertEqual(drafted.details['flags'], ['peanut_allergy_prometrium'])
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            approved = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)

    def test_no_flag_without_the_allergy_or_with_r11_disabled(self):
        self.assertEqual(self.choose('no').data['flag_reasons'], [])
        add_version(AlertRule.objects.get(organization=self.clinic, code='R11'), AlertRuleVersion, {'enabled': False},
                    user=self.doctor)
        self.assertEqual(self.choose('yes').data['flag_reasons'], [])


class RoutingSafetyTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('results', '{{results.table}}')

    def form(self, **fields):
        from product.intake.models import IntakeForm

        defaults = dict(organization=self.clinic, patient=self.patient, kind='full', status='complete',
                        token_hash=secrets.token_hex(32), expires_at=timezone.now() + timedelta(days=7),
                        submitted_at=timezone.now())
        return IntakeForm.objects.create(**{**defaults, **fields})

    def test_an_open_red_answer_alert_holds_a_new_case(self):
        from product.alerts.models import PatientAlert

        # R9 has no automatic check, so the evaluation run while routing leaves this alert alone.
        rule = AlertRule.objects.get(organization=self.clinic, code='R9')
        PatientAlert.objects.create(organization=self.clinic, patient=self.patient, rule=rule,
                                    rule_version=rule.current, level='red', message=rule.current.message,
                                    intake_form=self.form(catalogue_version='1', rules_evaluated_at=timezone.now()))
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['red_alert_open']))
        anyway = self.client.post(f'{BASE}{case.id}/draft-anyway/', {'reason': 'Seen in clinic'}, format='json')
        self.assertEqual(anyway.data['status'], 'drafted')

    def test_rules_not_checked_on_the_latest_form_hold_the_case_until_they_run(self):
        self.form()  # submitted before the catalogue: exempt
        self.assertEqual(self.read(pdfs.header() + pdfs.BLOODS[:2]).status, 'drafted')

        latest = self.form(catalogue_version='1')
        # Routing runs the rules itself; a rule that throws is recorded on the form and holds the case.
        with patch('product.alerts.services._fires', side_effect=ValueError):
            case = self.read(pdfs.header(collected='04/10/2026') + pdfs.BLOODS[2:3], name='second.pdf')
        self.assertIn('alert_rules_not_checked', case.flag_reasons)
        latest.refresh_from_db()
        self.assertTrue(latest.rule_errors)
        # The next routing, with every rule running, stamps the form and drafts the case.
        route_report(case.report)
        case.refresh_from_db()
        self.assertEqual((case.status, case.flag_reasons), ('drafted', []))
        latest.refresh_from_db()
        self.assertIsNotNone(latest.rules_evaluated_at)

    def test_uncertain_value_flag_clears_once_no_value_needs_a_check(self):
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        report = case.report
        report.flag_reasons = ['uncertain_value']
        report.save()
        value = report.values.first()
        value.needs_check = True
        value.save()
        route_report(report)
        case.refresh_from_db()
        self.assertEqual(case.flag_reasons, ['uncertain_value'])
        value.needs_check = False
        value.save()
        route_report(report)
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')

    def test_missing_english_phrase_flags_the_case(self):
        EmailTemplateVersion.objects.filter(template__organization=self.clinic,
                                            template__key='phrase.all_within_range').update(approved_at=None)
        self.approve('results', '{{results.abnormal}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[1:3])  # all within range
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['phrase_not_approved']))

    def test_smear_plans_name_the_template_and_say_whether_it_has_approved_wording(self):
        self.approve('smear_section_5', 'Colposcopy', subject='Your smear result')
        case = self.read(pdfs.header() + pdfs.SMEAR_ABNORMAL, slot='path')
        plans = {p['key']: p for p in self.detail(case)['smear_plans']}
        self.assertEqual((plans['smear_section_5']['name'], plans['smear_section_5']['has_approved_wording']),
                         ('Cervical smear email, section 5', True))
        self.assertFalse(plans['smear_section_6']['has_approved_wording'])


class ComparisonWordingTests(ReviewTestCase):
    def test_comparison_lines_state_the_range_and_attention_lists_what_is_out_of_range(self):
        self.approve('results', '{{results.table}}')
        self.approve('follow_up_comparison', '{{comparison.table}}\n\n{{comparison.attention}}')
        self.read(pdfs.header(collected='03/07/2026') + pdfs.BLOODS[:3], name='july.pdf')
        later = ['Ferritin 160.0 H ng/mL 13 - 150', 'TSH 1.8 mIU/L 0.4 - 4.0']
        case = self.read(pdfs.header(collected='03/10/2026') + later, name='october.pdf')
        body = self.detail(case)['draft']['body']
        self.assertIn('Ferritin: 32.0 ng/mL (3 July 2026) → 160.0 ng/mL (3 October 2026) '
                      '(higher, above the reference range)', body)
        self.assertTrue(body.endswith('Ferritin: 160.0 ng/mL (high) (reference 13 - 150)'), body)
        self.assertNotIn('points marked above', body)

    def test_range_states_and_the_different_lab_note(self):
        case = ResultsCase.objects.create(organization=self.clinic, patient=self.patient, status='drafted')
        wording = _Wording(case, 'en')

        def value(text, flag, day):
            return SimpleNamespace(lab_test=SimpleNamespace(name='TSH'), raw_name='TSH', value_text=text, unit='mIU/L',
                                   flag=flag, ref_low=1, ref_high=2, result_date=date(2026, 7, day))

        cases = [
            (('5.0', 'H'), ('3.0', 'H'), Change.DOWN, 'lower, closer to the reference range'),
            (('3.0', 'H'), ('5.0', 'H'), Change.UP, 'higher, further from the reference range'),
            (('0.5', 'L'), ('0.8', 'L'), Change.UP, 'higher, closer to the reference range'),
            (('1.5', 'N'), ('0.5', 'L'), Change.DOWN, 'lower, below the reference range'),
            (('0.5', 'L'), ('1.5', 'N'), Change.UP, 'higher, back within the reference range'),
            (('1.5', 'N'), ('1.6', 'N'), Change.UP, 'higher'),
        ]
        for before, now, change, words in cases:
            with self.subTest(words=words):
                line = _comparison_line(value(*now, 2), Comparison(change, value(*before, 1)), wording)
                self.assertTrue(line.endswith(f'({words})'), line)
        # WP-C sets notes and labs when only the lab differs; built by hand here.
        noted = Comparison(Change.SAME, value('1.5', 'N', 1), notes=['lab_differs'], labs=('Lab B', 'Lab A'))
        line = _comparison_line(value('1.5', 'N', 2), noted, wording)
        self.assertTrue(line.endswith('(unchanged, different lab: Lab A → Lab B)'), line)


class ReplyRecipientTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('prescription_reply', 'Dear {{patient.first_name}},\n{{patient.question}}', subject='Re: question')

    def reply_case(self, sender, third_party):
        from product.mail.models import MailMessage, MailThread

        thread = MailThread.objects.create(organization=self.clinic, patient=self.patient, contact_email=sender,
                                           last_message_at=timezone.now(), third_party=third_party,
                                           third_party_relation='Sister' if third_party else '')
        message = MailMessage.objects.create(organization=self.clinic, thread=thread, direction='in',
                                             status='received', message_id=f'<{thread.pk}@example.com>',
                                             from_address=sender, subject='Question', body_text='Is it safe?',
                                             sent_at=timezone.now())
        return open_reply_case(message)

    def approve_case(self, case, **payload):
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'{BASE}{case.id}/approve/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return SentEmail.objects.get(case=case)

    def test_patient_reply_goes_back_to_the_sender(self):
        sent = self.approve_case(self.reply_case('laila@example.com', third_party=False))
        self.assertEqual((sent.to_address, sent.to_thread_contact_confirmed_by), ('laila@example.com', None))

    def test_third_party_reply_goes_to_the_patient_unless_the_doctor_confirms(self):
        case = self.reply_case('sister@example.com', third_party=True)
        self.assertTrue(self.detail(case)['question']['third_party'])
        sent = self.approve_case(case)
        self.assertEqual((sent.to_address, sent.to_thread_contact_confirmed_by), ('laila@example.com', None))
        send_case_email.apply(args=[str(sent.id)])
        self.assertEqual(mail.outbox[-1].to, ['laila@example.com'])
        self.assertNotIn('In-Reply-To', mail.outbox[-1].extra_headers)

        confirmed = self.approve_case(self.reply_case('sister2@example.com', third_party=True),
                                      send_to_thread_contact=True)
        self.assertEqual((confirmed.to_address, confirmed.to_thread_contact_confirmed_by),
                         ('sister2@example.com', self.doctor))

    def test_report_cases_always_go_to_the_patient(self):
        self.approve('results', '{{results.table}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(self.approve_case(case, send_to_thread_contact=True).to_address, 'laila@example.com')


class AfterSendTests(ReviewTestCase):
    """evaluate_patient_safely is WP-B's (alerts/services.py); patched so these do not depend on it."""

    def setUp(self):
        super().setUp()
        self.approve('results', '{{results.table}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'{BASE}{case.id}/approve/')
        self.sent = SentEmail.objects.get(case=case)

    def test_alert_rules_run_again_after_a_successful_send(self):
        with patch('product.alerts.services.evaluate_patient_safely', create=True) as evaluate, \
                self.captureOnCommitCallbacks(execute=True):
            send_case_email.apply(args=[str(self.sent.id)])
        evaluate.assert_called_once()
        self.assertEqual(evaluate.call_args.args[0].pk, self.patient.pk)

    def test_a_failing_re_check_never_undoes_the_send(self):
        with patch('product.alerts.services.evaluate_patient_safely', create=True, side_effect=RuntimeError), \
                self.captureOnCommitCallbacks(execute=True):
            send_case_email.apply(args=[str(self.sent.id)])
        self.sent.refresh_from_db()
        self.assertEqual(self.sent.status, 'sent')
