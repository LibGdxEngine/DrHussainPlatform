import os
from datetime import date
from io import StringIO

from cryptography.fernet import Fernet
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.organizations.models import Organization
from product.patients.services import create_patient
from product.records.models import Document
from product.records.services import store_document
from product.storage import MAGIC
from product.testing import PrivateStorageMixin, make_member

PDF = b'%PDF-1.4\n(Laila Ahmed ferritin 32) Tj\n%%EOF\n'
OLD, NEW = Fernet.generate_key().decode(), Fernet.generate_key().decode()


@override_settings(MEDIA_ENCRYPTION_KEYS=OLD)
class EncryptionAtRestTests(PrivateStorageMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))

    def upload(self, content=PDF, name='report.pdf'):
        return store_document(organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
                              upload=SimpleUploadedFile(name, content, content_type='application/pdf'))

    def on_disk(self, document):
        with open(document.file.path, 'rb') as handle:
            return handle.read()

    def test_files_are_encrypted_on_disk_and_plain_in_the_platform(self):
        document = self.upload()
        raw = self.on_disk(document)
        self.assertTrue(raw.startswith(MAGIC))
        self.assertNotIn(b'Laila', raw)
        with document.file.open('rb') as handle:
            self.assertEqual(handle.read(), PDF)

    def test_files_written_before_encryption_are_still_read_and_the_command_encrypts_them(self):
        document = self.upload()
        with open(document.file.path, 'wb') as handle:
            handle.write(PDF)  # as a file saved before this release would be
        with Document.objects.get(pk=document.pk).file.open('rb') as handle:
            self.assertEqual(handle.read(), PDF)
        out = StringIO()
        call_command('encrypt_private_media', stdout=out)
        self.assertIn('Encrypted or re-keyed 1 file(s)', out.getvalue())
        self.assertTrue(self.on_disk(document).startswith(MAGIC))
        call_command('encrypt_private_media', stdout=out)
        self.assertIn('0 file(s); 1 already current', out.getvalue())

    def test_key_rotation(self):
        document = self.upload()
        with override_settings(MEDIA_ENCRYPTION_KEYS=f'{NEW},{OLD}'):
            with document.file.open('rb') as handle:
                self.assertEqual(handle.read(), PDF)  # the old key still decrypts
            call_command('encrypt_private_media', stdout=StringIO())
        with override_settings(MEDIA_ENCRYPTION_KEYS=NEW):
            with Document.objects.get(pk=document.pk).file.open('rb') as handle:
                self.assertEqual(handle.read(), PDF)  # the old key can now be retired
        self.assertFalse(any(name.endswith('.encrypting') for _, _, names in os.walk(self.storage_dir) for name in names))
