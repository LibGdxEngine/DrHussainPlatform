"""import_clinic_content, and the placeholder rules for saving system phrases."""
import json
import shutil
import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMember
from product.content.models import EmailTemplate, EmailTemplateVersion, Leaflet, PrescriptionVersion
from product.content.starter import ensure_starter_content
from product.testing import PrivateStorageMixin, make_member

EXAMPLE = Path(__file__).resolve().parents[1] / 'import_example' / 'clinic_content.example.json'


class ImportTests(PrivateStorageMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)

    def run_import(self, path=EXAMPLE, *args):
        call_command('import_clinic_content', 'v-clinic', str(path), *args, stdout=StringIO())

    def write(self, content):
        path = self.folder / 'content.json'
        path.write_text(json.dumps(content), encoding='utf-8')
        return path

    def versions(self):
        return (EmailTemplateVersion.objects.filter(template__organization=self.clinic).count(),
                PrescriptionVersion.objects.filter(item__organization=self.clinic).count(),
                Leaflet.objects.filter(organization=self.clinic).count())

    def template(self, key, language='en'):
        return EmailTemplate.objects.get(organization=self.clinic, key=key, language=language)

    def test_the_example_imports_once_and_nothing_is_approved_without_approve_as(self):
        ensure_starter_content(self.clinic)
        before = self.versions()
        self.run_import()
        after = self.versions()
        self.assertEqual((after[0] - before[0], after[1] - before[1], after[2] - before[2]), (3, 1, 1))
        results = self.template('results')
        self.assertEqual(results.latest.note[:len('Imported from clinic_content.example.json')],
                         'Imported from clinic_content.example.json')
        self.assertIsNone(results.approved)
        self.assertEqual(self.template('smear_section_5').name, 'EXAMPLE smear plan name - replace')
        leaflet = Leaflet.objects.get(organization=self.clinic)
        self.assertEqual(list(results.default_leaflets.all()), [leaflet])

        self.run_import()
        self.assertEqual(self.versions(), after)

    def test_approve_as_approves_without_adding_versions(self):
        self.run_import()
        counts = self.versions()
        self.run_import(EXAMPLE, '--approve-as', 'doctor@example.com')
        self.assertEqual(self.versions(), counts)
        approved = self.template('results').approved
        self.assertEqual((approved.approved_by, approved.number), (self.doctor, 2))
        self.assertEqual(self.template('phrase.default_subject').approved.body, 'EXAMPLE default subject - replace')

    def test_only_a_doctor_of_the_clinic_can_approve(self):
        with self.assertRaises(CommandError):
            self.run_import(EXAMPLE, '--approve-as', 'staff@example.com')

    def test_a_translation_links_to_the_english_it_translates(self):
        path = self.write({'templates': [
            {'key': 'results', 'language': 'ar', 'translated_from_key': 'results', 'body': '§ {{results.table}}'},
            {'key': 'results', 'body': 'EXAMPLE {{results.table}}'},
        ]})
        self.run_import(path, '--approve-as', 'doctor@example.com')
        english, arabic = self.template('results').approved, self.template('results', 'ar').approved
        self.assertEqual(arabic.translated_from, english)
        self.assertEqual(self.template('results', 'ar').kind, 'results')
        counts = self.versions()
        self.run_import(path, '--approve-as', 'doctor@example.com')
        self.assertEqual(self.versions(), counts)

    def test_a_translation_without_its_english_key_is_refused(self):
        path = self.write({'templates': [{'key': 'results', 'language': 'ar', 'body': '§'}]})
        with self.assertRaisesMessage(CommandError, 'translated_from_key'):
            self.run_import(path)

    def test_any_error_imports_nothing(self):
        ensure_starter_content(self.clinic)
        before = self.versions()
        path = self.write({
            'prescriptions': [{'drug': 'EXAMPLE drug'}],
            'templates': [{'key': 'results', 'body': 'EXAMPLE'},
                          {'key': 'phrase.reference', 'body': 'reference {{patient.first_name}}'}],
        })
        with self.assertRaisesMessage(CommandError, 'Unknown placeholder'):
            self.run_import(path)
        self.assertEqual(self.versions(), before)

    def test_a_new_template_key_needs_its_kind_and_part(self):
        path = self.write({'templates': [{'key': 'new_email', 'name': 'New', 'body': 'EXAMPLE'}]})
        with self.assertRaises(CommandError):
            self.run_import(path)
        self.run_import(self.write({'templates': [{'key': 'new_email', 'name': 'New', 'kind': 'results',
                                                   'body': 'EXAMPLE'}]}))
        self.assertEqual(self.template('new_email').kind, 'results')

    def test_a_leaflet_outside_the_import_folder_is_refused(self):
        # A real PDF one folder up: without the check, "../" would import it.
        shutil.copy(EXAMPLE.parent / 'placeholder-leaflet.pdf', self.folder / 'outside.pdf')
        inner = self.folder / 'import'
        inner.mkdir()
        path = inner / 'content.json'
        for pdf_path in ('../outside.pdf', str(self.folder / 'outside.pdf')):
            path.write_text(json.dumps({'leaflets': [{'title': 'Leaflet', 'pdf_path': pdf_path}]}), encoding='utf-8')
            with self.subTest(pdf_path), self.assertRaisesMessage(CommandError, 'inside the folder'):
                self.run_import(path)
        self.assertFalse(Leaflet.objects.filter(organization=self.clinic).exists())

    def test_prescriptions_are_matched_by_drug_name(self):
        self.run_import(self.write({'prescriptions': [{'drug': 'EXAMPLE drug', 'dose': '1'}]}))
        self.run_import(self.write({'prescriptions': [{'drug': 'example DRUG', 'dose': '2'}]}))
        versions = PrescriptionVersion.objects.filter(item__organization=self.clinic)
        self.assertEqual(versions.values('item').distinct().count(), 1)
        self.assertEqual(sorted(versions.values_list('dose', flat=True)), ['1', '2'])


class PhraseWordingTests(APITestCase):
    """A system phrase may use only its own slots; templates keep the template placeholders."""

    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.client.force_authenticate(make_member(self.clinic, 'doctor@example.com',
                                                   role=OrganizationMember.Role.OWNER))
        ensure_starter_content(self.clinic)

    def save(self, key, body, language='en'):
        template = EmailTemplate.objects.get(organization=self.clinic, key=key, language=language)
        return self.client.post(f'/api/product/content/templates/{template.id}/versions/', {'body': body},
                                format='json')

    def test_phrase_slots(self):
        self.assertEqual(self.save('phrase.reference', 'ref {{range}}').status_code, 201)
        self.assertEqual(self.save('phrase.reference', 'ref {{patient.first_name}}').status_code, 400)
        self.assertEqual(self.save('phrase.flag_high', 'high {{range}}').status_code, 400)
        self.assertEqual(self.save('results', 'Dear {{patient.first_name}}').status_code, 201)
        self.assertEqual(self.save('results', 'Dear {{range}}').status_code, 400)

    def test_creating_a_phrase_checks_its_slots_and_kind(self):
        url = '/api/product/content/templates/'
        ok = self.client.post(url, {'key': 'phrase.reference', 'language': 'ar', 'name': 'Reference range',
                                    'kind': 'phrase', 'body': '§ {{range}}'}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        wrong_kind = self.client.post(url, {'key': 'phrase.not_compared', 'language': 'ar', 'name': 'x',
                                            'kind': 'results', 'body': '§'}, format='json')
        self.assertEqual(wrong_kind.status_code, 400)
        bad_slot = self.client.post(url, {'key': 'phrase.flag_low', 'language': 'ar', 'name': 'x', 'kind': 'phrase',
                                          'body': '§ {{range}}'}, format='json')
        self.assertEqual(bad_slot.status_code, 400)
