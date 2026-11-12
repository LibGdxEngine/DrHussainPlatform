import json
from pathlib import Path

from django.test import SimpleTestCase

from product.intake.catalogue import (
    ADDABLE_MODULES, QUESTIONS, SECTIONS, AnswerError, clean_answers, missing_required, modules_for,
    visible_questions,
)

CASES = json.loads((Path(__file__).parent / 'module_cases.json').read_text(encoding='utf-8'))

# The question ids the alert rules read (the plan's rule-input table, section 2.2).
RULE_INPUTS = [
    'hs_breast_cancer', 'hs_breast_cancer_type', 'hs_breast_cancer_year', 'hs_coronary', 'hs_stroke', 'hs_vte',
    'hs_liver', 'hs_unexplained_bleeding', 'bleed_after_year', 'intermenstrual', 'peanut_allergy', 'pregnant',
    'pain_score', 'bleed_days', 'inf_pelvic_pain', 'pain_fever', 'inf_fever', 'breast_symptoms', 'breast_lump_new',
    'breast_discharge_bloody', 'self_harm', 'last_period', 'menopause_age', 'hs_migraine', 'smoking',
    'alcohol_units', 'fh_breast_cancer', 'fh_ovarian_cancer', 'fh_brca', 'fh_vte', 'fh_premature_cvd',
    'preeclampsia', 'gestational_diabetes', 'preterm', 'phq2_interest', 'phq2_down', 'gad2_nervous', 'gad2_worry',
    'mrs', 'desire_bother', 'supplements', 'current_medicines', 'utis_last_year', 'last_mammogram_date',
    'last_smear_date', 'lng_ius_date',
]


def expected_modules(case) -> set[str]:
    modules = set(case['modules'])
    if 'core' in modules:
        modules = (modules - {'core'}) | set(CASES['core'])
    return modules


class ModuleCaseTests(SimpleTestCase):
    def test_fixture_has_the_required_cases(self):
        self.assertGreaterEqual(len(CASES['cases']), 12)

    def test_every_case_opens_the_expected_modules(self):
        for case in CASES['cases']:
            with self.subTest(case['name']):
                opened = modules_for(case['answers'], case['age'], case['extra_modules'], case['kind'])
                self.assertEqual(opened, expected_modules(case))

    def test_every_case_shows_and_hides_the_expected_questions(self):
        for case in CASES['cases']:
            with self.subTest(case['name']):
                shown = visible_questions(case['answers'], case['age'], case['extra_modules'], case['kind'])
                self.assertLessEqual(set(case['shown']), shown)
                self.assertFalse(set(case['hidden']) & shown)

    def test_flushes_open_menopause_and_the_hormone_screen(self):
        opened = modules_for({'flushes_sweats': 'yes'}, 30, [])
        self.assertLessEqual({'menopause', 'hormone_screen'}, opened)


class CatalogueShapeTests(SimpleTestCase):
    def test_question_ids_are_unique(self):
        ids = [q['id'] for s in SECTIONS for q in s['questions']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len({s['id'] for s in SECTIONS}), len(SECTIONS))

    def test_rule_inputs_exist(self):
        self.assertEqual([qid for qid in RULE_INPUTS if qid not in QUESTIONS], [])

    def test_existing_answer_keys_are_kept(self):
        for qid in ('reasons', 'other_reason', 'last_period', 'period_status', 'bleed_after_year', 'menopause_age',
                    'uterus', 'pregnant', 'intermenstrual', 'overall', 'adherence', 'adherence_reason',
                    'side_effects', 'bleeding', 'medicines', 'notes'):
            self.assertIn(qid, QUESTIONS)

    def test_opens_when_names_only_earlier_sections(self):
        def modules_named(condition):
            if 'module' in condition:
                yield condition['module']
            for key in ('all', 'any'):
                for child in condition.get(key, []):
                    yield from modules_named(child)
            if 'not' in condition:
                yield from modules_named(condition['not'])

        seen = set()
        for section in SECTIONS:
            self.assertLessEqual(set(modules_named(section['opens_when'])), seen, section['id'])
            seen.add(section['id'])

    def test_also_in_names_sections(self):
        for question in QUESTIONS.values():
            for section_id in question.get('also_in', []):
                self.assertIn(section_id, {s['id'] for s in SECTIONS})

    def test_inferred_questions_are_marked(self):
        inferred = {qid for qid, q in QUESTIONS.items() if q.get('inferred')}
        self.assertEqual(inferred, {'flushes_sweats', 'inf_fever', 'breast_lump_new', 'breast_discharge_bloody'})

    def test_carry_forward(self):
        for qid in ('current_medicines', 'fh_vte', 'hs_vte', 'smoking', 'alcohol_units', 'last_smear_date',
                    'preeclampsia', 'other_conditions'):
            self.assertTrue(QUESTIONS[qid]['carry_forward'], qid)
        for qid in ('self_harm', 'phq2_interest', 'gad2_worry', 'low_desire', 'utis_last_year', 'pain_score',
                    'breast_symptoms', 'pregnant', 'bleed_after_year'):
            self.assertFalse(QUESTIONS[qid]['carry_forward'], qid)

    def test_part_a_and_mood_are_required_with_an_opt_out(self):
        for qid in ('hs_breast_cancer', 'hs_coronary', 'hs_stroke', 'hs_vte', 'hs_unexplained_bleeding', 'hs_liver',
                    'hs_cancer_treatment'):
            self.assertIs(QUESTIONS[qid]['required'], True)
            self.assertIn('discuss', [o['value'] for o in QUESTIONS[qid]['options']])
        for qid in ('phq2_interest', 'phq2_down', 'gad2_nervous', 'gad2_worry', 'self_harm'):
            self.assertIs(QUESTIONS[qid]['required'], True)
            self.assertEqual([o['value'] for o in QUESTIONS[qid]['options']], [0, 1, 2, 3, 'prefer_not'])

    def test_addable_modules(self):
        self.assertIn('breast', ADDABLE_MODULES)
        self.assertIn('menopause', ADDABLE_MODULES)
        self.assertNotIn('details', ADDABLE_MODULES)


class RequiredTests(SimpleTestCase):
    def test_stopped_requires_the_m3_fields(self):
        missing = missing_required({'reasons': ['routine'], 'period_status': 'stopped'}, 35, [])
        self.assertLessEqual({'bleed_after_year', 'menopause_age', 'how_periods_stopped', 'uterus', 'ovaries'},
                             set(missing))

    def test_not_sure_counts_as_an_answer(self):
        answers = {'reasons': ['routine'], 'period_status': 'stopped', 'menopause_age': 'not_sure'}
        self.assertNotIn('menopause_age', missing_required(answers, 35, []))

    def test_part_a_only_when_shown(self):
        self.assertNotIn('hs_vte', missing_required({'reasons': ['routine']}, 30, []))
        self.assertIn('hs_vte', missing_required({'reasons': ['meno']}, 30, []))

    def test_reasons_and_mood_are_always_required_on_the_full_form(self):
        missing = missing_required({}, 30, [])
        self.assertLessEqual({'reasons', 'period_status', 'phq2_interest', 'self_harm'}, set(missing))
        self.assertEqual(missing_required({}, 30, [], 'followup'), ['overall', 'adherence'])
        self.assertEqual(missing_required({'overall': 'same', 'adherence': 'yes'}, 30, [], 'followup'), [])


class CleanAnswersTests(SimpleTestCase):
    def test_unknown_keys_and_blanks_are_dropped(self):
        clean = clean_answers({'unknown': 1, 'notes': '  hi ', 'other_reason': '', 'mrs': [1] * 11})
        self.assertEqual(clean, {'notes': 'hi'})

    def test_follow_up_keys_are_not_full_form_keys(self):
        self.assertEqual(clean_answers({'overall': 'better'}, 'full'), {})
        self.assertEqual(clean_answers({'overall': 'better'}, 'followup'), {'overall': 'better'})

    def test_options_and_types_are_checked(self):
        for answers in ({'period_status': 'sometimes'}, {'reasons': ['nope']}, {'alcohol_units': 'lots'},
                        {'alcohol_units': True}, {'last_smear_date': '12/2024'}, {'last_smear_date': '20251011'},
                        {'last_smear_date': '2025-W41-6'}, {'lng_ius_date': '2025-10-11T00:00'},
                        {'discuss_in_person': 'yes'},
                        {'self_harm': 4}, {'menopause_age': 15}, {'pain_score': 11}):
            with self.subTest(answers), self.assertRaises(AnswerError) as caught:
                clean_answers(answers)
            self.assertEqual(set(caught.exception.fields), set(answers))

    def test_numbers_scores_and_not_sure(self):
        clean = clean_answers({'menopause_age': 'not_sure', 'self_harm': 0, 'phq2_down': 'prefer_not',
                               'alcohol_units': 20.0})
        self.assertEqual(clean, {'menopause_age': 'not_sure', 'self_harm': 0, 'phq2_down': 'prefer_not',
                                 'alcohol_units': 20})
        with self.assertRaises(AnswerError):
            clean_answers({'alcohol_units': 'not_sure'})

    def test_rows(self):
        clean = clean_answers({'current_medicines': [
            {'name': ' Utrogestan ', 'dose': '100 mg', 'extra': 'dropped'}, {'name': '', 'dose': ''}],
            'fh_vte': [{'relative': 'mother'}]})
        self.assertEqual(clean, {'current_medicines': [{'name': 'Utrogestan', 'dose': '100 mg'}],
                                 'fh_vte': [{'relative': 'mother'}]})
        with self.assertRaises(AnswerError):
            clean_answers({'current_medicines': [{'dose': '100 mg'}]})
        with self.assertRaises(AnswerError):
            clean_answers({'fh_vte': [{'relative': 'cousin'}]})

    def test_follow_up_medicines_keep_still_taking(self):
        clean = clean_answers({'medicines': [{'name': 'Estrogel'}, {'name': 'Oral', 'still_taking': False}]},
                              'followup')
        self.assertEqual(clean['medicines'], [{'name': 'Estrogel', 'still_taking': True},
                                              {'name': 'Oral', 'still_taking': False}])
