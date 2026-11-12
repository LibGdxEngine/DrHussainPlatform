"""
Arabic drafts (D3): parts with no current Arabic wording are translated side by side in review.

Guardrail G1: no Arabic is written here. Translations are obviously fake strings ("§…") with the
English placeholders kept, which is all the checks below need.
"""
import re
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from product.content.models import ClinicProfile, EmailTemplate
from product.results.tests import pdfs
from product.review.models import CaseTranslation
from product.review.translation import NullTranslator, get_translator
from product.testing import seed_phrases

from .test_review import BASE, ReviewTestCase


class FakeTranslator:
    def suggest(self, text, *, source, target):
        return f'§ suggested {text}'


class ArabicTestCase(ReviewTestCase):
    def setUp(self):
        super().setUp()
        ClinicProfile.objects.filter(organization=self.clinic).update(signature='Dr Example\nV-Clinic')

    def arabic(self, case):
        response = self.client.post(f'{BASE}{case.id}/options/', {'language': 'ar'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['draft']

    def sources(self, case):
        return self.client.get(f'{BASE}{case.id}/translations/').data

    def translate_all(self, case, keep=False):
        """Translate every listed part with fake text that keeps the English placeholders."""
        for item in self.sources(case):
            slots = ' '.join(f'{{{{{name}}}}}' for name in item['placeholders'])
            response = self.client.post(f'{BASE}{case.id}/translations/', {
                'key': item['key'], 'subject': '§ subject' if item['subject'] else '',
                'body': f'§ {slots}'.strip(), 'keep_for_future': keep,
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK, (item['key'], response.data))
        return self.detail(case)['draft']

    def smear(self, collected):
        return self.read(pdfs.header(collected=collected) + pdfs.SMEAR_NORMAL, name=f'smear-{collected[:2]}.pdf',
                         slot='path')


class MissingTranslationTests(ArabicTestCase):
    def setUp(self):
        super().setUp()
        # No subject: the subject comes from phrase.default_subject.
        self.approve('results', '{{results.table}}', subject='')
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])

    def test_missing_parts_are_listed_and_block_sending_even_when_the_marker_is_edited_out(self):
        draft = self.arabic(self.case)
        self.assertEqual(sorted(draft['missing_translations']), sorted([
            'results', 'phrase.flag_low', 'phrase.reference', 'phrase.signature', 'phrase.default_subject',
        ]))
        self.assertTrue(draft['body'].startswith('[[Translate: Results email]]\n\n'))
        self.assertIn('Translate: Results email', draft['open_slots'])
        self.assertIn('Translate: Reference range', draft['open_slots'])
        # The English stands in, so the doctor sees the whole email.
        self.assertIn('Ferritin: 32.0 ng/mL (low) (reference 13 - 150)', draft['body'])
        self.assertTrue(draft['body'].endswith('Dr Example\nV-Clinic'))

        body = draft['body'].replace('[[Translate: Results email]]\n\n', '')
        edited = self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': body}, format='json').data['draft']
        self.assertEqual(edited['missing_translations'], draft['missing_translations'])
        refused = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual((refused.status_code, refused.data['error']['code']), (409, 'missing_translations'))

    def test_translating_every_part_gives_a_sendable_draft_with_no_english_left(self):
        self.arabic(self.case)
        sources = {item['key']: item for item in self.sources(self.case)}
        self.assertEqual(sources['phrase.signature']['body'], 'Dr Example\nV-Clinic')  # from the clinic profile
        self.assertIsNone(sources['phrase.signature']['english_version'])
        self.assertEqual(sources['phrase.reference']['placeholders'], ['range'])
        self.assertTrue(sources['phrase.reference']['is_phrase'])

        draft = self.translate_all(self.case)
        self.assertEqual((draft['missing_translations'], draft['open_slots']), ([], []))
        # Only test names, units and values may be in Latin letters.
        for text in (draft['subject'], draft['body']):
            self.assertNotRegex(re.sub(r'Ferritin|TSH|HbA1c|ng/mL|mIU/L', '', text), '[A-Za-z]', text)
        self.assertTrue(draft['subject'].startswith('§'))
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            sent = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual((sent.status_code, sent.data['status']), (200, 'sending'))

    def test_placeholders_must_match_the_english(self):
        self.arabic(self.case)
        for body in ('§', '§ {{range}} {{patient.first_name}}'):
            response = self.client.post(f'{BASE}{self.case.id}/translations/',
                                        {'key': 'phrase.reference', 'body': body}, format='json')
            self.assertEqual((response.status_code, response.data['error']['code']), (400, 'placeholders_differ'))
        not_listed = self.client.post(f'{BASE}{self.case.id}/translations/', {'key': 'phrase.flag_high', 'body': '§'},
                                      format='json')
        self.assertEqual(not_listed.data['error']['code'], 'not_missing')

    def test_staff_can_read_the_parts_but_only_the_doctor_saves_them(self):
        self.arabic(self.case)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(f'{BASE}{self.case.id}/translations/').status_code, status.HTTP_200_OK)
        refused = self.client.post(f'{BASE}{self.case.id}/translations/', {'key': 'results', 'body': '§'},
                                   format='json')
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)

    def test_null_translator_by_default_and_a_local_translator_can_suggest(self):
        self.assertIsInstance(get_translator(), NullTranslator)
        self.arabic(self.case)
        self.assertTrue(all(item['suggestion'] is None for item in self.sources(self.case)))
        with override_settings(EMR_TRANSLATOR='product.review.tests.test_arabic.FakeTranslator'):
            reference = next(i for i in self.sources(self.case) if i['key'] == 'phrase.reference')
        self.assertEqual(reference['suggestion'], {'subject': '', 'body': '§ suggested reference {{range}}'})


class KeepForFutureTests(ArabicTestCase):
    def setUp(self):
        super().setUp()
        self.approve('smear_section_1', 'Normal smear wording.', subject='Your smear result')
        # Every phrase already has Arabic wording, except the signature (no English phrase to start from).
        seed_phrases(self.clinic, languages=('en', 'ar'))

    def test_without_keep_a_second_case_asks_again_and_with_it_none_does(self):
        first = self.smear('03/10/2026')
        self.assertEqual(sorted(self.arabic(first)['missing_translations']), ['phrase.signature', 'smear_section_1'])
        self.translate_all(first)
        self.assertEqual(self.detail(first)['draft']['missing_translations'], [])
        self.assertIsNone(EmailTemplate.objects.get(organization=self.clinic, key='smear_section_1',
                                                    language='ar').approved)

        second = self.smear('04/10/2026')
        self.assertEqual(sorted(self.arabic(second)['missing_translations']), ['phrase.signature', 'smear_section_1'])
        self.translate_all(second, keep=True)

        third = self.smear('05/10/2026')
        self.assertEqual(self.arabic(third)['missing_translations'], [])
        self.assertFalse(CaseTranslation.objects.filter(case=third).exists())

    def test_a_newer_english_version_makes_the_kept_translation_stale(self):
        kept = self.smear('03/10/2026')
        self.arabic(kept)
        self.translate_all(kept, keep=True)
        self.approve('smear_section_1', 'Reworded normal smear wording.', subject='Your smear result')
        later = self.smear('04/10/2026')
        self.assertEqual(self.arabic(later)['missing_translations'], ['smear_section_1'])

    def test_a_changed_profile_signature_needs_translating_again(self):
        kept = self.smear('03/10/2026')
        self.arabic(kept)
        self.translate_all(kept, keep=True)
        profile = ClinicProfile.objects.get(organization=self.clinic)
        profile.signature, profile.updated_at = 'Dr Example', timezone.now()
        profile.save()
        later = self.smear('04/10/2026')
        self.assertEqual(self.arabic(later)['missing_translations'], ['phrase.signature'])
