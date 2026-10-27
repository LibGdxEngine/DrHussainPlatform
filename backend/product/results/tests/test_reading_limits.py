"""Reading a report has its own queue and limits; running out of them marks the report, never leaves it pending."""
import io
from datetime import date
from unittest.mock import patch

from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.extraction.text import ExtractionError, extract_text
from product.results.models import InvestigationReport, LabTest
from product.results.tasks import read_report
from product.results.tests import pdfs
from product.review.models import ResultsCase
from product.testing import PrivateStorageMixin, make_member


class ReadingLimitsTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.client.force_authenticate(self.staff)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))

    def test_reading_runs_on_the_ocr_queue_with_its_own_limits(self):
        self.assertEqual(settings.CELERY_TASK_ROUTES['product.results.tasks.read_report'], {'queue': 'ocr'})
        self.assertEqual(read_report.soft_time_limit, settings.RESULTS_READ_SOFT_TIME_LIMIT)
        self.assertGreater(read_report.soft_time_limit, settings.CELERY_TASK_SOFT_TIME_LIMIT)
        self.assertGreater(read_report.time_limit, read_report.soft_time_limit)
        self.assertGreater(settings.CELERY_BROKER_TRANSPORT_OPTIONS['visibility_timeout'], read_report.time_limit)

    def test_running_out_of_time_marks_the_report_failed_and_flags_the_case(self):
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile('slow.pdf', pdfs.make_pdf(pdfs.header() + pdfs.BLOODS), content_type='application/pdf'),
        )
        with patch('product.results.pipeline.process_document', side_effect=SoftTimeLimitExceeded()):
            result = read_report.apply(args=[str(document.pk)]).get()
        report = InvestigationReport.objects.get(document=document)
        self.assertEqual(report.status, InvestigationReport.Status.FAILED)
        self.assertEqual(report.flag_reasons, ['read_timed_out'])
        self.assertFalse(report.in_history)
        self.assertIsNotNone(report.processed_at)
        self.assertEqual(result['status'], 'failed')
        case = ResultsCase.objects.get(report=report)
        self.assertEqual(case.status, ResultsCase.Status.FLAGGED)
        self.assertIn('read_timed_out', case.flag_reasons)
        # Reading it again (a fresh nonce) replaces the failure once it succeeds.
        reread = read_report.apply(args=[str(document.pk)], kwargs={'nonce': 'again'}).get()
        self.assertEqual(reread['status'], 'parsed')

    def test_a_scan_claiming_a_huge_canvas_is_refused(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new('RGB', (64, 64), 'white').save(buffer, format='PNG')
        with override_settings(RESULTS_MAX_IMAGE_PIXELS=1000):
            buffer.seek(0)
            with self.assertRaises(ExtractionError) as refused:
                extract_text(buffer, 'image/png')
        self.assertEqual(refused.exception.code, 'image_too_large')
        with override_settings(RESULTS_MAX_IMAGE_PIXELS=3000):
            # Over the limit but under twice it: PIL only warns, which is treated the same way.
            buffer.seek(0)
            with self.assertRaises(ExtractionError) as warned:
                extract_text(buffer, 'image/png')
        self.assertEqual(warned.exception.code, 'image_too_large')

    def test_catalog_is_loaded_when_the_clinic_is_created_not_on_each_read(self):
        clinic = Organization.objects.create(name='New clinic', slug='new-clinic')
        self.assertTrue(LabTest.objects.filter(organization=clinic, code='ferritin').exists())
        self.client.force_authenticate(make_member(clinic, 'new@example.com'))
        with patch('product.results.catalog.ensure_catalog') as ensure:
            response = self.client.get('/api/product/results/tests/', {'tracked': 'true'})
        self.assertEqual(response.status_code, 200)
        ensure.assert_not_called()
        self.assertEqual([t['code'] for t in response.data['results']][:2], ['ferritin', 'estradiol'])
