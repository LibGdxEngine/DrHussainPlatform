"""
Clearing answers (fix-round F7): a form that showed a carry-forward question decides it even when
left blank, a dependent answer is void once its parent answer no longer opens it, a follow-up's
"no longer taking" removes a medicine, and a form that did not show a question never clears it.
"""
from datetime import date, timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.organizations.models import Organization
from product.alerts.answer_rules import REGISTRY, _months_before
from product.content.models import AlertRuleVersion
from product.content.starter import STARTER_ALERT_RULES, STARTER_ANSWER_CHECKS, STARTER_MEDICINE_TERMS
from product.intake.catalogue import QUESTIONS, clean_answers
from product.intake.history import complete_forms, latest_complete_form, patient_history
from product.intake.models import IntakeForm
from product.intake.services import issue_form
from product.medicines import current_medicine_names
from product.orders.models import Order, PrescribedMedicine
from product.patients.services import create_patient

_STARTER = {row[0]: row for row in STARTER_ALERT_RULES}
SIX_YEARS_AGO = _months_before(date.today(), 72).isoformat()


def version(code, **overrides):
    _, field, pre, threshold_a, mid, threshold_b, post, level, message = _STARTER[code]
    values = {'field': field, 'pre': pre, 'threshold_a': threshold_a, 'mid': mid, 'threshold_b': threshold_b,
              'post': post, 'level': level, 'message': message, 'answer_check': STARTER_ANSWER_CHECKS[code],
              'medicine_terms': STARTER_MEDICINE_TERMS.get(code, [])}
    return AlertRuleVersion(**{**values, **overrides})


class CarryForwardTestCase(TestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 14))

    def complete(self, answers, *, days_ago, shown=(), kind='full'):
        form, _ = issue_form(self.clinic, self.patient, kind)
        IntakeForm.objects.filter(pk=form.pk).update(
            status=IntakeForm.Status.COMPLETE, answers=answers, shown_questions=list(shown),
            submitted_at=timezone.now() - timedelta(days=days_ago))
        form.refresh_from_db()
        return form

    def fires(self, code, **overrides):
        history = patient_history(self.patient)
        rule = version(code, **overrides)
        names = current_medicine_names(self.patient, history=history)
        return REGISTRY[rule.answer_check](history, rule, names)[0]


class ClearedAnswerTests(CarryForwardTestCase):
    def test_an_emptied_relatives_list_stops_r24_and_r26(self):
        self.complete({'fh_breast_cancer': [{'relative': 'mother', 'age': 40}], 'fh_vte': [{'relative': 'sister'}]},
                      days_ago=400, shown=['fh_breast_cancer', 'fh_vte'])
        self.assertTrue(self.fires('R24', threshold_a='50'))
        self.assertTrue(self.fires('R26'))
        newer = self.complete({}, days_ago=5, shown=['fh_breast_cancer', 'fh_vte'])
        history = patient_history(self.patient)
        self.assertIsNone(history.merged('fh_vte'))
        self.assertIsNone(history.form_for('fh_vte'))
        self.assertEqual(history.latest_form('fh_vte'), newer)
        self.assertFalse(self.fires('R24', threshold_a='50'))
        self.assertFalse(self.fires('R26'))

    def test_a_removed_supplement_stops_r32(self):
        self.complete({'supplements': [{'name': "St John's Wort"}]}, days_ago=400, shown=['supplements'])
        self.assertTrue(self.fires('R32'))
        self.complete({'supplements': None}, days_ago=5, shown=['supplements'])
        self.assertFalse(self.fires('R32'))

    def test_a_removed_medicine_stops_r11_and_leaves_the_medicine_list(self):
        self.complete({'peanut_allergy': 'yes', 'current_medicines': [{'name': 'Prometrium 100 mg'}]},
                      days_ago=400, shown=['peanut_allergy', 'current_medicines'])
        self.assertTrue(self.fires('R11'))
        self.complete({'peanut_allergy': 'yes'}, days_ago=5, shown=['peanut_allergy', 'current_medicines'])
        self.assertEqual(current_medicine_names(self.patient), [])
        self.assertFalse(self.fires('R11'))

    def test_an_emptied_multi_choice_is_empty(self):
        self.complete({'gynae_conditions': ['fibroids']}, days_ago=400, shown=['gynae_conditions'])
        self.complete({}, days_ago=5, shown=['gynae_conditions'])
        self.assertIsNone(patient_history(self.patient).merged('gynae_conditions'))

    def test_a_blank_question_that_is_not_carried_forward_keeps_the_older_answer(self):
        # Not prefilled, so blank means not answered this time, not "none".
        older = self.complete({'utis_last_year': 4}, days_ago=400, shown=['utis_last_year'])
        self.complete({}, days_ago=5, shown=['utis_last_year'])
        history = patient_history(self.patient)
        self.assertEqual(history.merged('utis_last_year'), 4)
        self.assertEqual(history.form_for('utis_last_year'), older)

    def test_a_legacy_form_never_clears(self):
        self.complete({'fh_vte': [{'relative': 'mother'}]}, days_ago=400, shown=['fh_vte'])
        self.complete({'fh_vte': [], 'notes': 'legacy'}, days_ago=5)
        self.assertEqual(patient_history(self.patient).merged('fh_vte'), [{'relative': 'mother'}])
        self.assertTrue(self.fires('R26'))


class DependentAnswerTests(CarryForwardTestCase):
    def test_r38_stops_once_the_contraception_is_no_longer_the_lng_ius(self):
        self.complete({'contraception': 'lng_ius', 'lng_ius_date': SIX_YEARS_AGO}, days_ago=400,
                      shown=['contraception', 'lng_ius_date'])
        self.assertTrue(self.fires('R38'))
        # A follow-up does not show contraception: the date still holds.
        self.complete({'overall': 'same'}, days_ago=100, shown=['overall'], kind='followup')
        self.assertTrue(self.fires('R38'))
        # A full form that showed contraception, now a copper IUD: the old LNG-IUS date is void.
        self.complete({'contraception': 'copper_iud'}, days_ago=5, shown=['contraception'])
        history = patient_history(self.patient)
        self.assertIsNone(history.merged('lng_ius_date'))
        self.assertIsNone(history.latest('lng_ius_date'))
        self.assertFalse(self.fires('R38'))

    def test_r38_stops_when_the_contraception_was_emptied(self):
        self.complete({'contraception': 'lng_ius', 'lng_ius_date': SIX_YEARS_AGO}, days_ago=400,
                      shown=['contraception', 'lng_ius_date'])
        self.complete({}, days_ago=5, shown=['contraception'])
        self.assertFalse(self.fires('R38'))

    def test_r31_stops_once_low_desire_is_no(self):
        self.complete({'low_desire': 'yes', 'desire_bother': 'a_lot'}, days_ago=400,
                      shown=['low_desire', 'desire_bother'])
        self.assertTrue(self.fires('R31'))
        self.complete({'low_desire': 'no'}, days_ago=5, shown=['low_desire'])
        self.assertFalse(self.fires('R31'))

    def test_a_show_if_on_open_sections_does_not_void_a_history_answer(self):
        # Age at menopause is asked when the menopause module is open or periods stopped. A later form
        # where neither holds ("on hormones so can't tell") did not show it: the history answer stays.
        self.complete({'period_status': 'stopped', 'menopause_age': 41}, days_ago=400,
                      shown=['period_status', 'menopause_age'])
        self.complete({'period_status': 'horm'}, days_ago=5, shown=['period_status'])
        self.assertEqual(patient_history(self.patient).merged('menopause_age'), 41)
        self.assertTrue(self.fires('R17', threshold_a='45', threshold_b='40'))


class NotShownIsNotClearedTests(CarryForwardTestCase):
    """Every merged-scope answer rule still fires when newer forms simply did not show its questions."""

    HISTORY = {
        'R1': {'hs_breast_cancer': 'yes'}, 'R2': {'hs_coronary': 'yes'}, 'R3': {'hs_stroke': 'yes'},
        'R4': {'hs_vte': 'yes'}, 'R5': {'hs_liver': 'yes'}, 'R17': {'menopause_age': 38},
        'R18': {'hs_migraine': 'with_aura'}, 'R19': {'smoking': 'current'}, 'R23': {'alcohol_units': 30},
        'R24': {'fh_breast_cancer': [{'relative': 'mother', 'age': 40}]},
        'R25': {'fh_ovarian_cancer': [{'relative': 'sister'}]}, 'R26': {'fh_vte': [{'relative': 'mother'}]},
        'R27': {'fh_premature_cvd': [{'relative': 'father', 'age': 45}]}, 'R28': {'preeclampsia': 'yes'},
        'R32': {'supplements': [{'name': 'Hypericum'}]}, 'R36': {'last_mammogram_date': SIX_YEARS_AGO},
        'R37': {'last_smear_date': SIX_YEARS_AGO},
        'R38': {'contraception': 'lng_ius', 'lng_ius_date': SIX_YEARS_AGO},
        'R11': {'peanut_allergy': 'yes', 'current_medicines': [{'name': 'Prometrium'}]},
        'R33': {'utis_last_year': 5, 'period_status': 'stopped'},
    }
    CUT_OFFS = {'R17': {'threshold_a': '45', 'threshold_b': '40'}, 'R23': {'threshold_a': '14'},
                'R24': {'threshold_a': '50'}, 'R27': {'threshold_a': '55', 'threshold_b': '65'},
                'R33': {'threshold_a': '3'}, 'R36': {'threshold_a': '24'}, 'R37': {'threshold_a': '36'}}

    def test_newer_forms_that_did_not_show_the_question(self):
        for code, answers in self.HISTORY.items():
            with self.subTest(code):
                IntakeForm.objects.filter(patient=self.patient).delete()
                self.complete(answers, days_ago=400, shown=list(answers))
                self.assertTrue(self.fires(code, **self.CUT_OFFS.get(code, {})), f'{code} should fire at first')
                # A follow-up, and a full form whose hormone screen and menopause questions stayed closed.
                self.complete({'overall': 'same'}, days_ago=60, shown=['overall', 'medicines'], kind='followup')
                # (Her periods answer itself is not what is under test: R33 also needs her postmenopausal.)
                self.complete({'reasons': ['routine'], 'period_status': answers.get('period_status', 'reg')},
                              days_ago=5, shown=['reasons', 'period_status', 'notes'])
                self.assertTrue(self.fires(code, **self.CUT_OFFS.get(code, {})), f'{code} stopped firing')

    def test_the_cases_cover_every_merged_scope_rule_question(self):
        merged_rules = {'R1', 'R2', 'R3', 'R4', 'R5', 'R11', 'R17', 'R18', 'R19', 'R23', 'R24', 'R25', 'R26',
                        'R27', 'R28', 'R32', 'R33', 'R36', 'R37', 'R38'}
        self.assertEqual(set(self.HISTORY), merged_rules)
        for answers in self.HISTORY.values():
            self.assertLessEqual(set(answers), set(QUESTIONS))


class StoppedMedicineTests(CarryForwardTestCase):
    def prescribe(self, drug, *, days_ago):
        order = Order.objects.create(organization=self.clinic, patient=self.patient, kind=Order.Kind.PRESCRIPTION,
                                     title='Prescription', delivery=Order.Delivery.PRINT)
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
        PrescribedMedicine.objects.create(order=order, drug=drug)

    def test_a_follow_up_marking_a_medicine_stopped_removes_it(self):
        self.prescribe('Prometrium 100 mg', days_ago=60)
        self.complete({'current_medicines': [{'name': 'Estrogel'}, {'name': 'Vitamin D'}]}, days_ago=50,
                      shown=['current_medicines'])
        self.assertEqual(current_medicine_names(self.patient), ['prometrium 100 mg', 'estrogel', 'vitamin d'])
        self.complete({'medicines': [{'name': 'Prometrium 100 mg', 'still_taking': False},
                                     {'name': 'Estrogel', 'still_taking': False},
                                     {'name': 'Vitamin D', 'still_taking': True}]},
                      days_ago=5, shown=['medicines'], kind='followup')
        self.assertEqual(current_medicine_names(self.patient), ['vitamin d'])

    def test_a_prescription_after_the_follow_up_brings_it_back(self):
        self.complete({'medicines': [{'name': 'Prometrium 100 mg', 'still_taking': False}]},
                      days_ago=30, shown=['medicines'], kind='followup')
        self.prescribe('Prometrium 100 mg', days_ago=2)
        self.assertEqual(current_medicine_names(self.patient), ['prometrium 100 mg'])


class SavingAnEmptiedAnswerTests(CarryForwardTestCase):
    def test_an_emptied_prefilled_answer_is_kept_as_none(self):
        clean = clean_answers({'fh_vte': [], 'current_medicines': None, 'gynae_conditions': [],
                               'other_reason': '', 'notes': ''})
        self.assertEqual(clean, {'fh_vte': None, 'current_medicines': None, 'gynae_conditions': None})
        self.assertEqual(clean_answers({'medicines': []}, 'followup'), {'medicines': None})

    def test_the_payload_does_not_carry_an_emptied_answer_forward(self):
        from product.intake.services import previous_answers

        self.complete({'fh_vte': [{'relative': 'mother'}], 'smoking': 'current'}, days_ago=400,
                      shown=['fh_vte', 'smoking'])
        self.complete({'fh_vte': None}, days_ago=5, shown=['fh_vte'])
        self.assertEqual(previous_answers(self.patient), {'smoking': 'current'})


class LatestCompleteFormTests(CarryForwardTestCase):
    def test_one_order_for_every_reader(self):
        older = self.complete({}, days_ago=10)
        newer = self.complete({}, days_ago=1)
        unsent = self.complete({}, days_ago=0)
        IntakeForm.objects.filter(pk=unsent.pk).update(submitted_at=None)
        self.assertEqual(latest_complete_form(self.patient), newer)
        self.assertEqual(list(complete_forms(self.patient)), [newer, older, unsent])
        self.assertEqual(patient_history(self.patient).forms, [newer, older, unsent])

    def test_the_rule_run_is_stamped_on_that_form_and_its_errors_returned(self):
        from product.alerts.services import evaluate_patient_safely

        older = self.complete({}, days_ago=10)
        chosen = self.complete({}, days_ago=1)
        with (mock.patch('product.intake.history.latest_complete_form', return_value=chosen) as latest,
              mock.patch('product.alerts.services.evaluate_patient', side_effect=RuntimeError('boom')),
              self.assertLogs('product.alerts.services', level='ERROR')):
            errors = evaluate_patient_safely(self.patient)
        latest.assert_called_once_with(self.patient)
        self.assertEqual(errors, [{'rule': 'all', 'error': 'RuntimeError'}])
        chosen.refresh_from_db()
        older.refresh_from_db()
        self.assertEqual((chosen.rule_errors, older.rule_errors), (errors, []))
        self.assertEqual(evaluate_patient_safely(self.patient), [])
