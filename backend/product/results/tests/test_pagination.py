"""Every list is a page: {count, next, previous, results}. The frontend wrappers read it as such."""
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMember
from product.alerts.services import evaluate_patient
from product.mail import services as mail_services
from product.mail.tests.test_mail import raw_email
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.review.services import route_report
from product.testing import PrivateStorageMixin, make_member

ENVELOPE = {'count', 'next', 'previous', 'results'}


class PaginationTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.doctor, slot='lab',
            upload=SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.header() + pdfs.BLOODS), content_type='application/pdf'),
        )
        route_report(process_document(document))
        evaluate_patient(self.patient)
        mail_services.ingest(self.clinic, raw_email(sender='laila@example.com', subject='Hello'))

    def test_lists_return_the_page_envelope(self):
        patient = str(self.patient.id)
        endpoints = [
            ('/api/product/records/documents/', {'patient': patient}),
            ('/api/product/results/reports/', {}),
            ('/api/product/results/tests/', {}),
            ('/api/product/results/history/', {'patient': patient}),
            ('/api/product/review/cases/', {}),
            ('/api/product/alerts/', {'status': 'all'}),
            ('/api/product/mail/threads/', {}),
            ('/api/product/content/templates/', {}),
            ('/api/product/content/alert-rules/', {}),
            ('/api/audit/', {}),
        ]
        for url, params in endpoints:
            with self.subTest(url=url):
                response = self.client.get(url, params)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(set(response.data), ENVELOPE)
                self.assertGreater(response.data['count'], 0)
                self.assertEqual(response.data['count'], len(response.data['results']))

    def test_page_size_can_be_raised_up_to_the_cap(self):
        url = '/api/product/results/tests/'
        page = self.client.get(url, {'page_size': 2}).data
        self.assertEqual(len(page['results']), 2)
        self.assertGreater(page['count'], 2)
        self.assertIsNotNone(page['next'])
        second = self.client.get(url, {'page_size': 2, 'page': 2}).data
        self.assertNotEqual(second['results'][0]['id'], page['results'][0]['id'])
        everything = self.client.get(url, {'page_size': 100000}).data
        self.assertEqual(len(everything['results']), everything['count'])
        self.assertIsNone(everything['next'])
