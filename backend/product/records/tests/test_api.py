from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization
from product.patients.services import create_patient
from product.records.models import Document
from product.testing import PrivateStorageMixin, make_member

URL = '/api/product/records/documents/'
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


def pdf(name='baseline-bloods.pdf', content=PDF):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


class DocumentApiTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.client.force_authenticate(self.staff)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))

    def upload(self, **overrides):
        data = {'patient': str(self.patient.id), 'slot': 'lab', 'document_date': '2026-10-03', 'file': pdf()}
        data.update(overrides)
        return self.client.post(URL, data, format='multipart')

    def test_upload_stores_file_privately_and_is_audited(self):
        response = self.upload()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['title'], 'baseline-bloods')
        self.assertEqual(response.data['content_type'], 'application/pdf')
        self.assertNotIn('file', response.data)
        document = Document.objects.get(pk=response.data['id'])
        self.assertTrue(document.file.path.startswith(self.storage_dir))
        self.assertEqual(document.uploaded_by, self.staff)
        self.assertTrue(AuditLog.objects.filter(action='document.uploaded', resource_id=str(document.id)).exists())

    def test_type_is_detected_from_content_not_the_name(self):
        response = self.upload(file=pdf('report.pdf', b'MZ\x90\x00 not really a pdf'))
        self.assertEqual(response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        self.assertEqual(response.data['error']['code'], 'UNSUPPORTED_DOCUMENT_TYPE')
        self.assertFalse(Document.objects.exists())

    @override_settings(DOCUMENT_MAX_UPLOAD_BYTES=10)
    def test_rejects_files_over_the_limit(self):
        response = self.upload()
        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(response.data['error']['code'], 'DOCUMENT_TOO_LARGE')

    def test_same_file_twice_for_one_patient_is_rejected(self):
        self.assertEqual(self.upload().status_code, status.HTTP_201_CREATED)
        response = self.upload(file=pdf('copy.pdf'))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error']['code'], 'DUPLICATE_DOCUMENT')

    def test_cannot_upload_to_another_clinics_patient(self):
        other = Organization.objects.create(name='Other', slug='other')
        stranger = create_patient(other, full_name='Someone', date_of_birth=date(1980, 1, 1))
        response = self.upload(patient=str(stranger.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('patient', response.data['error']['fields'])

    def test_list_filters_by_patient_and_slot(self):
        self.upload()
        self.upload(slot='letter', file=pdf('referral.pdf', PDF + b'%letter'))
        other_patient = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1979, 6, 1))
        self.upload(patient=str(other_patient.id), file=pdf('other.pdf', PDF + b'%other'))

        response = self.client.get(URL, {'patient': str(self.patient.id)})
        self.assertEqual(sorted(d['slot'] for d in response.data), ['lab', 'letter'])
        letters = self.client.get(URL, {'patient': str(self.patient.id), 'slot': 'letter'})
        self.assertEqual([d['title'] for d in letters.data], ['referral'])

    def test_download_streams_the_original_and_is_audited(self):
        document_id = self.upload().data['id']
        response = self.client.get(f'{URL}{document_id}/file/', {'download': '1'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(b''.join(response.streaming_content), PDF)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertTrue(AuditLog.objects.filter(action='document.opened', resource_id=document_id).exists())

    def test_download_requires_membership_of_the_clinic(self):
        document_id = self.upload().data['id']
        outsider = make_member(Organization.objects.create(name='Other', slug='other'), 'outsider@example.com')
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(f'{URL}{document_id}/file/').status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{URL}{document_id}/file/').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rename_and_recategorise(self):
        document_id = self.upload().data['id']
        response = self.client.patch(f'{URL}{document_id}/', {'title': 'Baseline panel', 'slot': 'path'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual((response.data['title'], response.data['slot']), ('Baseline panel', 'path'))
        self.assertEqual(self.client.delete(f'{URL}{document_id}/').status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
