from datetime import date, timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.organizations.models import Organization
from product.intake.history import parse_period_date, patient_history
from product.intake.models import IntakeForm
from product.intake.services import issue_form
from product.patients.services import create_patient

MRS = [3, 1, 3, 2, 2, 1, 2, 2, 0, 1, 1]


class HistoryTests(TestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 14))

    def complete(self, answers, *, days_ago, shown=(), kind='full', mrs=None):
        form, _ = issue_form(self.clinic, self.patient, kind)
        IntakeForm.objects.filter(pk=form.pk).update(
            status=IntakeForm.Status.COMPLETE, answers=answers, shown_questions=list(shown), mrs=mrs,
            submitted_at=timezone.now() - timedelta(days=days_ago))
        form.refresh_from_db()
        return form

    def test_legacy_form_counts_as_showing_what_it_answered(self):
        legacy = self.complete({'bleed_after_year': 'yes'}, days_ago=30)
        history = patient_history(self.patient)
        self.assertEqual(history.latest('bleed_after_year'), 'yes')
        self.assertEqual(history.latest_form('bleed_after_year'), legacy)

    def test_legacy_form_without_the_answer_does_not_mask_an_older_one(self):
        older = self.complete({'fh_vte': [{'relative': 'mother'}]}, days_ago=400, shown=['fh_vte'])
        self.complete({'notes': 'legacy, no family history'}, days_ago=10)
        history = patient_history(self.patient)
        self.assertEqual(history.merged('fh_vte'), [{'relative': 'mother'}])
        self.assertEqual(history.form_for('fh_vte'), older)

    def test_latest_ignores_an_older_yes_once_a_newer_form_showed_it_and_said_no(self):
        self.complete({'bleed_after_year': 'yes'}, days_ago=200, shown=['bleed_after_year'])
        newer = self.complete({'bleed_after_year': 'no'}, days_ago=5, shown=['bleed_after_year'])
        history = patient_history(self.patient)
        self.assertEqual(history.latest('bleed_after_year'), 'no')
        self.assertEqual(history.latest_form('bleed_after_year'), newer)

    def test_latest_is_blank_when_the_newest_form_showed_it_unanswered(self):
        self.complete({'self_harm': 1}, days_ago=200, shown=['self_harm'])
        self.complete({}, days_ago=5, shown=['self_harm'])
        self.assertIsNone(patient_history(self.patient).latest('self_harm'))

    def test_merged_keeps_the_older_answer_when_a_newer_form_did_not_show_it(self):
        older = self.complete({'fh_vte': [{'relative': 'sister'}]}, days_ago=400, shown=['fh_vte'])
        self.complete({'overall': 'better'}, days_ago=10, shown=['overall'], kind='followup')
        history = patient_history(self.patient)
        self.assertEqual(history.merged('fh_vte'), [{'relative': 'sister'}])
        self.assertEqual(history.form_for('fh_vte'), older)
        self.assertEqual(history.latest('overall'), 'better')

    def test_incomplete_forms_are_ignored(self):
        form, _ = issue_form(self.clinic, self.patient, 'full')
        IntakeForm.objects.filter(pk=form.pk).update(status=IntakeForm.Status.IN_PROGRESS,
                                                     answers={'smoking': 'current'})
        history = patient_history(self.patient)
        self.assertEqual(history.forms, [])
        self.assertIsNone(history.merged('smoking'))
        self.assertIsNone(history.form_for('smoking'))

    def test_mrs_from_the_newest_scored_form(self):
        scored = self.complete({}, days_ago=50, mrs=MRS)
        self.complete({'overall': 'same'}, days_ago=5, kind='followup')
        history = patient_history(self.patient)
        self.assertEqual(history.mrs, MRS)
        self.assertEqual(history.mrs_form, scored)

    @mock.patch('product.intake.history.timezone.localdate', return_value=date(2026, 11, 11))
    def test_age_and_years_since_the_last_period(self, _today):
        self.complete({'last_period': 'March 2020', 'period_status': 'stopped'}, days_ago=5)
        history = patient_history(self.patient)
        self.assertEqual(history.age, 52)
        self.assertAlmostEqual(history.years_since_lmp, 6.66, places=1)
        self.assertTrue(history.postmenopausal)

    @mock.patch('product.intake.history.timezone.localdate', return_value=date(2026, 11, 11))
    def test_years_since_menopause_from_the_age_at_menopause(self, _today):
        self.complete({'last_period': 'Not sure', 'menopause_age': 40}, days_ago=5)
        self.assertEqual(patient_history(self.patient).years_since_lmp, 12.0)

    def test_nothing_known(self):
        self.complete({'menopause_age': 'not_sure', 'period_status': 'reg'}, days_ago=5)
        history = patient_history(self.patient)
        self.assertIsNone(history.years_since_lmp)
        self.assertFalse(history.postmenopausal)
        self.assertIsNone(history.mrs)

    def test_parse_period_date(self):
        self.assertEqual(parse_period_date('2025-08-14'), date(2025, 8, 14))
        self.assertEqual(parse_period_date('2025-08'), date(2025, 8, 15))
        self.assertEqual(parse_period_date(' Aug 2025 '), date(2025, 8, 15))
        self.assertEqual(parse_period_date('August 2025'), date(2025, 8, 15))
        self.assertEqual(parse_period_date('8/2025'), date(2025, 8, 15))
        self.assertEqual(parse_period_date('2019'), date(2019, 7, 1))
        self.assertIsNone(parse_period_date('Not sure'))
        self.assertIsNone(parse_period_date(None))
