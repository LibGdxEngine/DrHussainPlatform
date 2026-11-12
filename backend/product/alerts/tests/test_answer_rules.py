"""
The answer checks, one positive and one negative case (or more) per line of the plan's rule-input
table. The checks are pure functions over a PatientHistory; here a small stand-in holds the answers
so each check is tested without forms in the database (test_alerts.py runs them end to end).
"""
from datetime import date

from django.test import SimpleTestCase

from product.alerts.answer_rules import PREFERS_TO_DISCUSS, REGISTRY, _months_before
from product.content.answer_checks import ANSWER_CHECKS
from product.content.models import AlertRuleVersion
from product.content.starter import STARTER_ALERT_RULES, STARTER_ANSWER_CHECKS, STARTER_MEDICINE_TERMS

FORM = object()  # stands in for the IntakeForm the answer came from
MRS_FORM = object()
_STARTER = {row[0]: row for row in STARTER_ALERT_RULES}


class History:
    """The PatientHistory interface (intake/history.py) over plain dicts."""

    def __init__(self, answers=None, *, latest=None, merged=None, age=50, postmenopausal=False,
                 years_since_lmp=None, mrs=None):
        answers = answers or {}
        self._latest = {**answers, **(latest or {})}
        self._merged = {**answers, **(merged or {})}
        self.age, self.postmenopausal, self.years_since_lmp = age, postmenopausal, years_since_lmp
        self.mrs, self.mrs_form = mrs, (MRS_FORM if mrs else None)

    def latest(self, qid):
        return self._latest.get(qid)

    def merged(self, qid):
        return self._merged.get(qid)

    def form_for(self, qid):
        return FORM if self._merged.get(qid) is not None or self._latest.get(qid) is not None else None


def version(code, **overrides):
    """The starter version of rule `code` (cut-offs, medicine terms), unsaved."""
    _, field, pre, threshold_a, mid, threshold_b, post, level, message = _STARTER[code]
    values = {'field': field, 'pre': pre, 'threshold_a': threshold_a, 'mid': mid, 'threshold_b': threshold_b,
              'post': post, 'level': level, 'message': message, 'answer_check': STARTER_ANSWER_CHECKS[code],
              'medicine_terms': STARTER_MEDICINE_TERMS.get(code, [])}
    return AlertRuleVersion(**{**values, **overrides})


def years_ago(years, months=0, days=0):
    day = _months_before(date.today(), years * 12 + months)
    return date.fromordinal(day.toordinal() - days).isoformat()


class AnswerCheckTestCase(SimpleTestCase):
    def check(self, code, history, medicine_names=(), **overrides):
        rule = version(code, **overrides)
        return REGISTRY[rule.answer_check](history, rule, list(medicine_names))

    def assertFires(self, code, history, detail=None, medicine_names=(), **overrides):
        fires, form, got = self.check(code, history, medicine_names, **overrides)
        self.assertTrue(fires, f'{code} should fire')
        if detail is not None:
            self.assertEqual(got, detail)
        return form, got

    def assertSilent(self, code, history, medicine_names=(), **overrides):
        self.assertEqual(self.check(code, history, medicine_names, **overrides), (False, None, ''),
                         f'{code} should not fire')


class RegistryTests(SimpleTestCase):
    def test_every_answer_check_code_has_a_check_and_no_more(self):
        self.assertEqual(REGISTRY.keys(), ANSWER_CHECKS.keys())

    def test_every_starter_answer_rule_points_at_a_check(self):
        self.assertLessEqual(set(STARTER_ANSWER_CHECKS.values()), REGISTRY.keys())


class PartATests(AnswerCheckTestCase):
    QUESTIONS = {'R1': 'hs_breast_cancer', 'R2': 'hs_coronary', 'R3': 'hs_stroke', 'R4': 'hs_vte',
                 'R5': 'hs_liver', 'R6': 'hs_unexplained_bleeding'}

    def test_yes_fires_r1_to_r6(self):
        for code, qid in self.QUESTIONS.items():
            with self.subTest(code):
                form, _ = self.assertFires(code, History({qid: 'yes'}))
                self.assertIs(form, FORM)

    def test_prefer_to_discuss_fires_r1_to_r6(self):
        for code, qid in self.QUESTIONS.items():
            with self.subTest(code):
                self.assertFires(code, History({qid: 'discuss'}), detail=PREFERS_TO_DISCUSS)

    def test_no_and_unanswered_do_not_fire(self):
        for code, qid in self.QUESTIONS.items():
            with self.subTest(code):
                self.assertSilent(code, History({qid: 'no'}))
                self.assertSilent(code, History())

    def test_r1_detail_carries_the_type_and_year(self):
        self.assertFires('R1', History({'hs_breast_cancer': 'yes', 'hs_breast_cancer_type': 'er_pos',
                                        'hs_breast_cancer_year': 2015}), detail='er_pos, 2015')

    def test_r1_to_r5_read_the_merged_history_and_r6_the_latest_form(self):
        # A history condition is kept from an older form; bleeding "now" is only the newest form's answer.
        self.assertFires('R2', History(merged={'hs_coronary': 'yes'}))
        self.assertSilent('R6', History(merged={'hs_unexplained_bleeding': 'yes'}))
        self.assertFires('R6', History(latest={'hs_unexplained_bleeding': 'yes'}))


class BleedingTests(AnswerCheckTestCase):
    def test_r7_bleeding_after_a_year(self):
        self.assertFires('R7', History({'bleed_after_year': 'yes'}))
        self.assertSilent('R7', History({'bleed_after_year': 'no'}))
        self.assertSilent('R7', History())

    def test_r7_reads_only_the_newest_form_that_asked(self):
        self.assertSilent('R7', History(latest={'bleed_after_year': 'no'}, merged={'bleed_after_year': 'yes'}))

    def test_r7_has_no_cut_off(self):
        # The 12 months is part of the question: a leftover cut-off changes nothing.
        self.assertFires('R7', History({'bleed_after_year': 'yes'}), threshold_a='6')

    def test_r8_intermenstrual_bleeding(self):
        self.assertFires('R8', History({'intermenstrual': 'yes'}))
        self.assertSilent('R8', History({'intermenstrual': 'no'}))
        self.assertSilent('R8', History(merged={'intermenstrual': 'yes'}))


class MedicineTests(AnswerCheckTestCase):
    def test_r11_peanut_allergy_with_prometrium(self):
        _, detail = self.assertFires('R11', History({'peanut_allergy': 'yes'}), medicine_names=['prometrium 100 mg'])
        self.assertEqual(detail, 'prometrium 100 mg')
        self.assertFires('R11', History({'peanut_allergy': 'yes'}), medicine_names=['micronized progesterone'])

    def test_r11_needs_both_the_allergy_and_the_medicine(self):
        self.assertSilent('R11', History({'peanut_allergy': 'yes'}), medicine_names=['estradiol gel'])
        self.assertSilent('R11', History({'peanut_allergy': 'no'}), medicine_names=['prometrium'])
        self.assertSilent('R11', History(), medicine_names=['prometrium'])

    def test_r11_uses_the_clinic_terms(self):
        self.assertFires('R11', History({'peanut_allergy': 'yes'}), medicine_names=['utrogestan'],
                         medicine_terms=['utrogestan'])

    def test_r32_st_johns_wort_with_a_curly_apostrophe(self):
        form, detail = self.assertFires('R32', History({'supplements': [{'name': 'St John’s Wort'}]}))
        self.assertEqual((form, detail), (FORM, 'st johns wort'))

    def test_r32_from_the_current_medicines(self):
        self.assertFires('R32', History(), medicine_names=['hypericum extract'])

    def test_r32_other_supplements_do_not_fire(self):
        self.assertSilent('R32', History({'supplements': [{'name': 'Black cohosh'}]}), medicine_names=['vitamin d'])
        self.assertSilent('R32', History())


class AcuteSymptomTests(AnswerCheckTestCase):
    def test_r12_possible_pregnancy_with_pain_or_bleeding(self):
        self.assertFires('R12', History({'pregnant': 'unsure', 'pain_score': 3}))
        self.assertFires('R12', History({'pregnant': 'yes', 'bleed_days': 4}))
        self.assertFires('R12', History({'pregnant': 'yes', 'intermenstrual': 'yes'}))

    def test_r12_needs_both(self):
        self.assertSilent('R12', History({'pregnant': 'yes', 'pain_score': 0}))
        self.assertSilent('R12', History({'pregnant': 'no', 'pain_score': 6}))
        self.assertSilent('R12', History({'pain_score': 6}))
        self.assertSilent('R12', History(merged={'pregnant': 'yes', 'pain_score': 6}))

    def test_r13_pelvic_pain_with_fever(self):
        self.assertFires('R13', History({'pain_score': 5, 'pain_fever': 'yes'}))
        self.assertFires('R13', History({'inf_pelvic_pain': 'yes', 'inf_fever': 'yes'}))

    def test_r13_pain_alone_or_fever_alone(self):
        self.assertSilent('R13', History({'pain_score': 5, 'pain_fever': 'no'}))
        self.assertSilent('R13', History({'pain_score': 0, 'inf_fever': 'yes'}))

    def test_r14_breast_concern(self):
        self.assertFires('R14', History({'breast_symptoms': ['lump']}), detail='lump')  # "new" not answered
        self.assertFires('R14', History({'breast_symptoms': ['lump'], 'breast_lump_new': 'unsure'}))
        self.assertFires('R14', History({'breast_symptoms': ['skin']}), detail='skin change')
        self.assertFires('R14', History({'breast_symptoms': ['discharge'], 'breast_discharge_bloody': 'unsure'}))

    def test_r14_an_old_lump_clear_discharge_or_pain_alone(self):
        self.assertSilent('R14', History({'breast_symptoms': ['lump'], 'breast_lump_new': 'no'}))
        self.assertSilent('R14', History({'breast_symptoms': ['discharge'], 'breast_discharge_bloody': 'no'}))
        self.assertSilent('R14', History({'breast_symptoms': ['pain']}))
        self.assertSilent('R14', History())


class MoodTests(AnswerCheckTestCase):
    def test_r15_any_answer_but_not_at_all(self):
        self.assertFires('R15', History({'self_harm': 1}), detail='Score 1')
        self.assertFires('R15', History({'self_harm': 'prefer_not'}), detail='Prefer not to say')

    def test_r15_not_at_all_or_unanswered(self):
        self.assertSilent('R15', History({'self_harm': 0}))
        self.assertSilent('R15', History())
        self.assertSilent('R15', History(merged={'self_harm': 3}))  # an older form's answer is not "now"

    def test_r29_phq2_or_gad2(self):
        self.assertFires('R29', History({'phq2_interest': 2, 'phq2_down': 1}), detail='PHQ-2 3 ≥ 3')
        self.assertFires('R29', History({'gad2_nervous': 3, 'gad2_worry': 'prefer_not'}), detail='GAD-2 3 ≥ 3')

    def test_r29_below_the_cut_off(self):
        self.assertSilent('R29', History({'phq2_interest': 1, 'phq2_down': 1, 'gad2_nervous': 2,
                                          'gad2_worry': 'prefer_not'}))
        self.assertSilent('R29', History())
        self.assertSilent('R29', History({'phq2_interest': 3}), threshold_a='[set]')

    def test_r30_mrs_item_2(self):
        form, detail = self.assertFires('R30', History(mrs=[0, 3] + [0] * 9))
        self.assertEqual((form, detail), (MRS_FORM, 'MRS item 2: 3 ≥ 3'))
        self.assertSilent('R30', History(mrs=[4, 2] + [4] * 9))
        self.assertSilent('R30', History())

    def test_r31_a_lot(self):
        self.assertFires('R31', History({'desire_bother': 'a_lot'}))
        self.assertSilent('R31', History({'desire_bother': 'a_little'}))
        self.assertSilent('R31', History())


class AgeAndMenopauseTests(AnswerCheckTestCase):
    def test_r16_age(self):
        form, detail = self.assertFires('R16', History(age=61))
        self.assertEqual((form, detail), (None, 'Age 61 ≥ 60'))

    def test_r16_years_since_the_last_period(self):
        form, _ = self.assertFires('R16', History({'last_period': '2015'}, age=52, years_since_lmp=11.2))
        self.assertIs(form, FORM)

    def test_r16_younger_and_recent(self):
        self.assertSilent('R16', History(age=52, years_since_lmp=10))
        self.assertSilent('R16', History(age=None))

    def test_r17_early_menopause_and_poi(self):
        self.assertFires('R17', History({'menopause_age': 43}), detail='Menopause at 43 < 45')
        self.assertFires('R17', History({'menopause_age': 38}), detail='Menopause at 38 < 45 (POI, < 40)')

    def test_r17_not_sure_or_later(self):
        self.assertSilent('R17', History({'menopause_age': 'not_sure'}))
        self.assertSilent('R17', History({'menopause_age': 50}))
        self.assertSilent('R17', History())

    def test_r33_utis_when_postmenopausal(self):
        self.assertFires('R33', History({'utis_last_year': 2}, postmenopausal=True))
        self.assertSilent('R33', History({'utis_last_year': 3}, postmenopausal=False))
        self.assertSilent('R33', History({'utis_last_year': 1}, postmenopausal=True))
        self.assertSilent('R33', History({'utis_last_year': 'prefer_not'}, postmenopausal=True))


class CautionTests(AnswerCheckTestCase):
    def test_r18_migraine_with_aura(self):
        self.assertFires('R18', History({'hs_migraine': 'with_aura'}))
        self.assertSilent('R18', History({'hs_migraine': 'without_aura'}))
        self.assertSilent('R18', History())

    def test_r19_current_smoker(self):
        self.assertFires('R19', History({'smoking': 'current'}, age=30), detail='Current smoker')
        self.assertFires('R19', History({'smoking': 'current'}, age=40), detail='Current smoker, age 40 ≥ 35')
        self.assertSilent('R19', History({'smoking': 'ex'}))
        self.assertSilent('R19', History())

    def test_r23_alcohol(self):
        self.assertFires('R23', History({'alcohol_units': 14}), detail='14 units/week ≥ 14')
        self.assertSilent('R23', History({'alcohol_units': 13}))
        self.assertSilent('R23', History({'alcohol_units': 20}), threshold_a='21')
        self.assertSilent('R23', History())

    def test_r28_pregnancy_complications(self):
        self.assertFires('R28', History({'preeclampsia': 'no', 'preterm': 'yes'}), detail='preterm')
        self.assertSilent('R28', History({'preeclampsia': 'no', 'gestational_diabetes': 'no', 'preterm': 'no'}))


class FamilyHistoryTests(AnswerCheckTestCase):
    def test_r24_first_degree_relative_young_or_two_relatives(self):
        self.assertFires('R24', History({'fh_breast_cancer': [{'relative': 'mother', 'age': 45}]}))
        self.assertFires('R24', History({'fh_breast_cancer': [{'relative': 'aunt', 'age': 60},
                                                              {'relative': 'cousin', 'age': 70}]}),
                         detail='2 relatives')

    def test_r24_one_older_or_distant_relative(self):
        self.assertSilent('R24', History({'fh_breast_cancer': [{'relative': 'aunt', 'age': 40}]}))
        self.assertSilent('R24', History({'fh_breast_cancer': [{'relative': 'mother', 'age': 62}]}))
        self.assertSilent('R24', History())

    def test_r25_ovarian_cancer_or_a_cancer_gene(self):
        self.assertFires('R25', History({'fh_ovarian_cancer': [{'relative': 'aunt', 'age': 55}]}))
        self.assertFires('R25', History({'fh_brca': 'yes'}))
        self.assertSilent('R25', History({'fh_brca': 'unsure', 'fh_ovarian_cancer': []}))

    def test_r26_first_degree_blood_clots(self):
        self.assertFires('R26', History({'fh_vte': [{'relative': 'sister'}]}), detail='sister')
        self.assertSilent('R26', History({'fh_vte': [{'relative': 'aunt'}]}))
        self.assertSilent('R26', History())

    def test_r26_is_kept_from_an_older_form(self):
        self.assertFires('R26', History(merged={'fh_vte': [{'relative': 'brother'}]}))

    def test_r27_premature_heart_disease(self):
        self.assertFires('R27', History({'fh_premature_cvd': [{'relative': 'father', 'age': 50}]}))
        self.assertFires('R27', History({'fh_premature_cvd': [{'relative': 'mother', 'age': 60}]}))
        self.assertSilent('R27', History({'fh_premature_cvd': [{'relative': 'father', 'age': 60}]}))
        self.assertSilent('R27', History({'fh_premature_cvd': [{'relative': 'mother', 'age': 66}]}))


class ScreeningDateTests(AnswerCheckTestCase):
    def test_r36_and_r37_stay_silent_while_the_cut_off_is_not_set(self):
        self.assertSilent('R36', History({'last_mammogram_date': years_ago(10)}))
        self.assertSilent('R37', History({'last_smear_date': years_ago(10)}))

    def test_r36_mammogram_older_than_the_cut_off(self):
        self.assertFires('R36', History({'last_mammogram_date': years_ago(3)}), threshold_a='24')
        self.assertSilent('R36', History({'last_mammogram_date': years_ago(1)}), threshold_a='24')
        self.assertSilent('R36', History(), threshold_a='24')

    def test_r37_smear_older_than_the_cut_off(self):
        self.assertFires('R37', History({'last_smear_date': years_ago(3, days=1)}), threshold_a='36')
        self.assertSilent('R37', History({'last_smear_date': years_ago(3)}), threshold_a='36')

    def test_r38_lng_ius_measured_in_years(self):
        self.assertFires('R38', History({'lng_ius_date': years_ago(5)}))  # 5 years exactly: >= 5 years
        self.assertSilent('R38', History({'lng_ius_date': years_ago(4, months=11)}))
        # 5 means years, not months: a coil put in 6 months ago is not due.
        self.assertSilent('R38', History({'lng_ius_date': years_ago(0, months=6)}))
        self.assertSilent('R38', History({'lng_ius_date': 'not a date'}))
        # Only YYYY-MM-DD is a date: compact and week dates (which fromisoformat takes) are not.
        for odd in ('20151011', '2015-W41-6', '2015-10', '2015-10-11T00:00'):
            self.assertSilent('R38', History({'lng_ius_date': odd}))
