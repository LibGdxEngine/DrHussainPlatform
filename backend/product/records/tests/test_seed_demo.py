"""The demo seed: runs on an empty clinic, is safe to repeat, writes no clinical wording, and fires the answer rules."""
import re
from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from apps.organizations.models import Organization, OrganizationMember
from product.alerts.models import PatientAlert
from product.content.models import (
    AlertRule, AlertRuleVersion, EmailTemplate, EmailTemplateVersion, Leaflet, TemplateKind,
)
from product.content.placeholders import placeholder_names
from product.intake.models import IntakeForm
from product.patients.models import Patient
from product.testing import PrivateStorageMixin, make_user

ARABIC = re.compile('[؀-ۿ]')


def seed(**options):
    out = StringIO()
    call_command('seed_demo_data', '--org', 'v-clinic', stdout=out, **options)
    return out.getvalue()


@override_settings(ALLOW_DEMO_SEED=True)
class SeedDemoTests(PrivateStorageMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.admin = make_user('admin@vclinic.local')
        OrganizationMember.objects.create(organization=self.clinic, user=self.admin,
                                          role=OrganizationMember.Role.OWNER)
        seed()

    def template(self, key, language='en'):
        return EmailTemplate.objects.get(organization=self.clinic, key=key, language=language)

    def codes(self, patient_name):
        patient = Patient.objects.get(organization=self.clinic, full_name=patient_name)
        return set(PatientAlert.objects.filter(patient=patient, status='open').values_list('rule__code', flat=True))

    # --- What the demo contains --------------------------------------------------------------------

    def test_seeds_patients_and_the_full_form_fires_the_answer_rules(self):
        self.assertEqual(Patient.objects.filter(organization=self.clinic).count(), 9)
        amira = self.codes('Amira Khalil')
        self.assertTrue({'R7', 'R19', 'R29'} <= amira, amira)
        form = IntakeForm.objects.get(patient__full_name='Amira Khalil', status=IntakeForm.Status.COMPLETE)
        self.assertIsNotNone(form.rules_evaluated_at)
        self.assertEqual(form.rule_errors, [])
        for code in ('R7', 'R19', 'R29'):
            self.assertTrue(PatientAlert.objects.filter(intake_form=form, rule__code=code).exists(), code)

    def test_laila_has_no_testosterone_medicine_so_r34_stays_quiet(self):
        self.assertNotIn('R34', self.codes('Laila Ahmed'))

    def test_one_patient_prefers_arabic(self):
        self.assertTrue(Patient.objects.filter(organization=self.clinic, preferred_language='ar').exists())

    def test_there_is_no_r41_and_no_default_starting_hrt_leaflet(self):
        self.assertFalse(AlertRule.objects.filter(organization=self.clinic, code='R41').exists())
        self.assertFalse(self.template('menopause_results').default_leaflets.exists())
        self.assertTrue(Leaflet.objects.filter(organization=self.clinic, title__startswith='Starting HRT').exists())

    # --- Wording ---------------------------------------------------------------------------------------

    def test_sti_wording_has_no_clinical_advice(self):
        sections = EmailTemplate.objects.filter(organization=self.clinic, key__startswith='sti_section_')
        self.assertTrue(sections.exists())
        for template in sections:
            body = template.approved.body
            self.assertIn("[[Clinic's advice for this result]]", body)
            self.assertNotIn('treatable', body)
        closing = self.template('sti_closing').approved.body
        self.assertIn('{{follow_up}}', closing)
        everything = ' '.join(t.approved.body.lower() for t in EmailTemplate.objects.filter(
            organization=self.clinic, language='en').exclude(kind=TemplateKind.PHRASE) if t.approved)
        for text in ('intimate contact', 'repeat test', 'chlamydia'):
            self.assertNotIn(text, everything)

    def test_smear_plans_2_to_14_are_neutral_and_unapproved_and_plan_1_is_unchanged(self):
        for number in range(2, 15):
            template = self.template(f'smear_section_{number}')
            self.assertEqual(template.name, f'Smear plan {number} (clinic wording not loaded)')
            self.assertIsNone(template.approved)
            self.assertEqual(template.latest.body, '[[Clinic wording for this plan]]')
        self.assertIsNotNone(self.template('smear_section_1').approved)

    def test_follow_up_comparison_uses_the_attention_placeholder(self):
        self.assertIn('comparison.attention', placeholder_names(self.template('follow_up_comparison').approved.body))

    def test_only_the_existing_arabic_row_has_arabic_and_it_is_tied_to_the_english_version(self):
        arabic_rows = {v.template.key for v in EmailTemplateVersion.objects.filter(template__organization=self.clinic)
                       if ARABIC.search(v.body + v.subject)}
        self.assertEqual(arabic_rows, {'results'})
        arabic = self.template('results', 'ar')
        self.assertEqual(arabic.approved.translated_from, self.template('results').approved)
        self.assertEqual(arabic.kind, TemplateKind.RESULTS)

    # --- Running again and where it may run ---------------------------------------------------------

    def test_running_twice_adds_no_patients_and_changes_nothing_a_person_wrote(self):
        edited = self.template('results')
        EmailTemplateVersion.objects.create(template=edited, number=edited.latest.number + 1, subject='S',
                                            body='Dr Gohar wrote this.', note='Edited', created_by=self.admin,
                                            approved_by=self.admin, approved_at=edited.approved.approved_at)
        before = (Patient.objects.count(), EmailTemplateVersion.objects.count())
        self.assertIn('already has patients', seed())
        self.assertEqual((Patient.objects.count(), EmailTemplateVersion.objects.count()), before)
        self.assertEqual(self.template('results').approved.body, 'Dr Gohar wrote this.')

    def test_a_second_run_cleans_up_what_an_older_seed_left(self):
        rule = AlertRule.objects.create(organization=self.clinic, code='R41', sort_order=410)
        version = AlertRuleVersion.objects.create(rule=rule, number=1, field='Ferritin (labs)', level='red',
                                                  message='x', lab_test_code='ferritin', lab_check='lt',
                                                  note='Demo rule', created_by=self.admin)
        PatientAlert.objects.create(organization=self.clinic, patient=Patient.objects.first(), rule=rule,
                                    rule_version=version, level='red', message='x')
        hrt = Leaflet.objects.get(organization=self.clinic, title__startswith='Starting HRT')
        self.template('menopause_results').default_leaflets.add(hrt)
        section = EmailTemplate.objects.filter(organization=self.clinic, key__startswith='sti_section_').first()
        old = EmailTemplateVersion.objects.create(
            template=section, number=section.latest.number + 1, body='Please avoid intimate contact.',
            note='Demo wording', created_by=self.admin, approved_by=self.admin, approved_at=self.clinic.created_at)
        plan = self.template('smear_section_5')
        EmailTemplateVersion.objects.filter(template=plan, note='Demo wording').update(
            approved_at=self.clinic.created_at)

        seed()

        self.assertFalse(AlertRule.objects.filter(organization=self.clinic, code='R41').exists())
        self.assertFalse(self.template('menopause_results').default_leaflets.exists())
        self.assertNotIn('intimate', EmailTemplate.objects.get(pk=section.pk).approved.body)
        self.assertTrue(EmailTemplateVersion.objects.filter(pk=old.pk).exists(), 'old versions are kept')
        self.assertIsNone(self.template('smear_section_5').approved)

    def test_a_clinic_made_r41_is_not_deleted(self):
        rule = AlertRule.objects.create(organization=self.clinic, code='R41', sort_order=410)
        AlertRuleVersion.objects.create(rule=rule, number=1, field='Own rule', level='amber', message='x',
                                        note='Added by the clinic', created_by=self.admin)
        seed()
        self.assertTrue(AlertRule.objects.filter(organization=self.clinic, code='R41').exists())


class SeedGuardTests(TestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        admin = make_user('admin@vclinic.local')
        OrganizationMember.objects.create(organization=self.clinic, user=admin, role=OrganizationMember.Role.OWNER)

    @override_settings(DEBUG=False, ALLOW_DEMO_SEED=False)
    def test_refused_without_debug_or_the_opt_in(self):
        with self.assertRaises(CommandError):
            seed()
        self.assertFalse(Patient.objects.exists())

    @override_settings(DEBUG=True, ALLOW_DEMO_SEED=True, SETTINGS_MODULE='core.settings.prod')
    def test_never_runs_under_the_production_settings(self):
        with self.assertRaises(CommandError):
            seed()
        self.assertFalse(Patient.objects.exists())
