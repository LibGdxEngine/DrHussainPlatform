from importlib import import_module

from django.apps import apps
from django.test import TestCase

from apps.organizations.models import Organization
from product.content.models import AlertRule, AlertRuleVersion, EmailTemplate, EmailTemplateVersion

link_answer_rules = import_module('product.content.migrations.0009_link_starter_answer_rules').link
add_phrases = import_module('product.content.migrations.0010_starter_phrases').add_phrases


class StarterDataMigrationTests(TestCase):
    """A clinic seeded before answer rules and phrases existed is brought up to date, once."""

    def setUp(self):
        self.clinic = Organization.objects.create(name='Old clinic', slug='old-clinic')
        # Creating a clinic loads today's starter content; replace it with what an old clinic has.
        AlertRule.objects.filter(organization=self.clinic).delete()
        EmailTemplate.objects.filter(organization=self.clinic).delete()
        # The rules as the old starter loaded them.
        old = [
            ('R7', 'Bleeding since last period (3)', '≥', '12', 'months', 'red'),
            ('R15', 'Self-harm question (6d)', 'any answer other than "Never"', None, '', 'red'),
            ('R23', 'Alcohol (9)', '≥', '14', 'units/week', 'amber'),
            ('R32', "St John's Wort (7)", 'listed', None, '', 'amber'),
            ('R34', 'Total testosterone (labs)', '>', '50', 'ng/dL on treatment', 'amber'),
        ]
        for position, (code, field, pre, a, mid, level) in enumerate(old):
            rule = AlertRule.objects.create(organization=self.clinic, code=code, sort_order=position)
            AlertRuleVersion.objects.create(
                rule=rule, number=1, field=field, pre=pre, threshold_a=a, mid=mid, level=level, message='x',
                lab_test_code='testosterone_total' if code == 'R34' else '', lab_check='gt' if code == 'R34' else '',
            )
        # A rule the clinic reworded is left alone.
        reworded = AlertRule.objects.create(organization=self.clinic, code='R1', sort_order=9)
        AlertRuleVersion.objects.create(rule=reworded, number=1, field='Clinic wording', level='red', message='x')
        template = EmailTemplate.objects.create(organization=self.clinic, key='results', name='Results',
                                                kind='results')
        EmailTemplateVersion.objects.create(template=template, number=1, body='x')

    def current(self, code):
        return AlertRule.objects.get(organization=self.clinic, code=code).current

    def test_answer_rules_are_linked_once_and_starter_text_corrected(self):
        link_answer_rules(apps, None)
        count = AlertRuleVersion.objects.count()
        link_answer_rules(apps, None)
        self.assertEqual(AlertRuleVersion.objects.count(), count)

        r7 = self.current('R7')
        self.assertEqual((r7.number, r7.answer_check, r7.pre, r7.threshold_a, r7.mid),
                         (2, 'bleeding_after_year', '= Yes', None, ''))
        self.assertEqual(r7.note, 'R7: the 12 months is part of the question, not a cut-off')
        self.assertEqual(self.current('R15').pre, "any answer other than 'Not at all'")
        r23 = self.current('R23')
        self.assertEqual((r23.answer_check, r23.threshold_a), ('alcohol_units', '14'))
        self.assertEqual(self.current('R32').medicine_terms, ["st john's wort", 'st johns wort', 'hypericum'])
        r34 = self.current('R34')
        self.assertEqual((r34.answer_check, r34.medicine_terms, r34.lab_check), ('', ['testosterone'], 'gt'))
        self.assertEqual((self.current('R1').number, self.current('R1').answer_check), (1, ''))

    def test_phrases_are_added_once_for_clinics_with_starter_templates(self):
        add_phrases(apps, None)
        add_phrases(apps, None)
        phrases = EmailTemplate.objects.filter(organization=self.clinic, kind='phrase')
        self.assertEqual(phrases.count(), 19)
        self.assertFalse(phrases.filter(key='phrase.signature').exists())
        self.assertFalse(phrases.exclude(language='en').exists())
        version = phrases.get(key='phrase.all_within_range').approved
        self.assertEqual((version.body, version.note),
                         ('All results are within the reference range.', 'System phrase moved from code'))
        # A clinic that has not opened its settings yet gets the phrases with its starter content.
        empty = Organization.objects.create(name='New clinic', slug='new-clinic')
        EmailTemplate.objects.filter(organization=empty).delete()
        add_phrases(apps, None)
        self.assertFalse(EmailTemplate.objects.filter(organization=empty).exists())


class SeedPhrasesHelperTests(TestCase):
    def test_english_and_fake_translations(self):
        from product.content.starter import ensure_starter_content
        from product.testing import seed_phrases

        clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        ensure_starter_content(clinic)
        seeded = seed_phrases(clinic, languages=('ar', 'en'))
        self.assertNotIn(('phrase.signature', 'en'), seeded)
        english, arabic = seeded[('phrase.reference', 'en')], seeded[('phrase.reference', 'ar')]
        self.assertEqual(english.body, 'reference {{range}}')
        self.assertEqual(arabic.translated_from, english)
        self.assertIn('{{range}}', arabic.body)
        self.assertEqual(seed_phrases(clinic, languages=('ar', 'en')), seeded)
