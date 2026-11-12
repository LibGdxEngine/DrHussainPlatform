"""M5: uncertain readings go to the doctor; S3: comparing across labs; S12: report titles."""
import io
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.alerts.models import PatientAlert
from product.content.models import EmailTemplate, EmailTemplateVersion
from product.content.starter import ensure_starter_content
from product.content.versioning import add_version
from product.orders.models import Order, PrescribedMedicine
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.comparison import Change, compare
from product.results.models import InvestigationReport
from product.results.pipeline import process_document
from product.review.models import ResultsCase
from product.review.services import route_report
from product.testing import PrivateStorageMixin, make_member, seed_phrases

from . import pdfs

BASE = '/api/product/results/'
UNSURE_TSH = 'TSH 3.1 mIU/L 0.4 - 4.0 see note'


class ValueCheckTestCase(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        ensure_starter_content(self.clinic)
        seed_phrases(self.clinic)
        template = EmailTemplate.objects.get(organization=self.clinic, key='results', language='en')
        version, _ = add_version(template, EmailTemplateVersion, {'body': '{{results.table}}'}, user=self.doctor)
        version.approved_by, version.approved_at = self.doctor, timezone.now()
        version.save()

    def upload(self, content, name='report.pdf', content_type='application/pdf'):
        return store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile(name, content, content_type=content_type),
        )

    def read(self, rows, name='report.pdf', collected='03/10/2026', lab=None) -> InvestigationReport:
        lines = pdfs.header(collected=collected) + rows
        if lab:
            lines[0] = lab
        report = process_document(self.upload(pdfs.make_pdf(lines), name=name))
        route_report(report)
        return report

    def value(self, report, code):
        return report.values.get(lab_test__code=code)

    def check(self, value, **corrections):
        return self.client.post(f'{BASE}values/{value.id}/check/', corrections, format='json')


class UncertainValueTests(ValueCheckTestCase):
    def test_the_client_tsh_line_reads_as_tsh_3_1(self):
        report = self.read(['TSH 3rd generation 3.1 mIU/L 0.4 - 4.0'])
        tsh = self.value(report, 'tsh')
        self.assertEqual((tsh.value_numeric, tsh.unit, tsh.ref_low, tsh.ref_high, tsh.needs_check),
                         (Decimal('3.1'), 'mIU/L', Decimal('0.4'), Decimal('4.0'), False))
        self.assertEqual(report.status, InvestigationReport.Status.PARSED, report.flag_reasons)

    def test_a_leftover_flags_the_report_and_holds_the_case_until_the_doctor_checks_it(self):
        report = self.read(['Ferritin 48.0 ng/mL 13 - 150', UNSURE_TSH])
        tsh = self.value(report, 'tsh')
        self.assertEqual((tsh.needs_check, tsh.check_reason), (True, 'ref_leftover'))
        self.assertEqual((report.status, report.flag_reasons), ('flagged', ['uncertain_value']))
        case = ResultsCase.objects.get(report=report)
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['uncertain_value']))
        self.assertFalse(case.drafts.filter(is_current=True).exists())

        response = self.check(tsh, ref_text='0.4 - 4.0')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['status'], response.data['flag_reasons']), ('parsed', []))
        checked = next(v for v in response.data['values'] if str(v['id']) == str(tsh.id))
        self.assertEqual((checked['needs_check'], checked['ref_text'], checked['checked_by']),
                         (False, '0.4 - 4.0', self.doctor.id))
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')
        self.assertTrue(AuditLog.objects.filter(action='result_value.checked', resource_id=str(tsh.id)).exists())

    def test_a_correction_recomputes_the_number_and_flag(self):
        report = self.read(['Ferritin 45ng/mL 13 - 150'])
        ferritin = self.value(report, 'ferritin')
        self.assertEqual(ferritin.check_reason, 'value_glued')
        self.assertEqual(self.check(ferritin, value_text='4,5').status_code, status.HTTP_200_OK)
        ferritin.refresh_from_db()
        self.assertEqual((ferritin.value_numeric, ferritin.flag, ferritin.needs_check), (Decimal('4.5'), 'L', False))
        self.assertEqual(self.check(ferritin, value_text='a lot').status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_report_keeps_its_flag_while_another_value_is_uncertain(self):
        report = self.read([UNSURE_TSH, 'Ferritin 45ng/mL 13 - 150'])
        self.check(self.value(report, 'tsh'))
        report.refresh_from_db()
        self.assertEqual(report.flag_reasons, ['uncertain_value'])
        self.check(self.value(report, 'ferritin'))
        report.refresh_from_db()
        self.assertEqual(report.flag_reasons, [])

    def test_only_the_doctor_checks_values(self):
        report = self.read([UNSURE_TSH])
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.check(self.value(report, 'tsh')).status_code, status.HTTP_403_FORBIDDEN)

    def test_an_uncertain_value_is_left_out_of_r34_until_checked(self):
        order = Order.objects.create(organization=self.clinic, patient=self.patient, kind=Order.Kind.PRESCRIPTION,
                                     title='Prescription', delivery=Order.Delivery.PRINT, issued_by=self.doctor)
        PrescribedMedicine.objects.create(order=order, drug='Testosterone gel')
        report = self.read(['Testosterone 62 ng/dL 8 - 60 see note'])
        self.assertFalse(PatientAlert.objects.filter(patient=self.patient, rule__code='R34', status='open').exists())
        self.check(self.value(report, 'testosterone_total'), ref_text='8 - 60')
        self.assertTrue(PatientAlert.objects.filter(patient=self.patient, rule__code='R34', status='open').exists())

    def test_an_uncertain_value_is_left_out_of_the_history_until_checked(self):
        first = self.read([UNSURE_TSH], name='july.pdf', collected='03/07/2026')
        second = self.read(['TSH 2.0 mIU/L 0.4 - 4.0'], name='october.pdf')
        self.assertEqual(compare(self.value(second, 'tsh')).change, Change.FIRST)
        uncertain = compare(self.value(first, 'tsh'), self.value(second, 'tsh'))
        self.assertEqual(uncertain.change, Change.NOT_COMPARABLE)
        self.assertIn('value_needs_check', uncertain.reasons)
        self.check(self.value(first, 'tsh'), ref_text='0.4 - 4.0')
        self.assertEqual(compare(self.value(second, 'tsh')).change, Change.DOWN)

    def test_low_confidence_ocr_words_mark_their_line(self):
        lines = ['Nile Diagnostics Laboratory', 'Patient Name: Laila Ahmed', 'DOB: 09/03/1974',
                 'Collected: 03/10/2026', 'Ferritin 32.0 L ng/mL 13 - 150', 'TSH 1.8 mIU/L 0.4 - 4.0']
        words = [(line_no, word) for line_no, line in enumerate(lines, start=1) for word in line.split()]
        data = {
            'text': [w for _, w in words], 'page_num': [1] * len(words), 'block_num': [1] * len(words),
            'par_num': [1] * len(words), 'line_num': [n for n, _ in words],
            'conf': [41 if w == '32.0' else 96 for _, w in words],
        }
        buffer = io.BytesIO()
        Image.new('RGB', (50, 50), 'white').save(buffer, 'PNG')
        with patch('pytesseract.image_to_data', return_value=data):
            report = process_document(self.upload(buffer.getvalue(), name='scan.png', content_type='image/png'))
        self.assertEqual(report.method, 'ocr')
        self.assertEqual(self.value(report, 'ferritin').check_reason, 'ocr_low_confidence')
        self.assertFalse(self.value(report, 'tsh').needs_check)
        self.assertIn('uncertain_value', report.flag_reasons)


class CrossLabComparisonTests(ValueCheckTestCase):
    def test_another_lab_with_the_same_unit_and_range_compares_with_a_note(self):
        self.read(['TSH 1.8 mIU/L 0.4 - 4.0'], name='july.pdf', collected='03/07/2026')
        later = self.read(['TSH 2.6 mIU/L 0.4 - 4.0'], name='october.pdf', lab='Delta Medical Labs')
        result = compare(self.value(later, 'tsh'))
        self.assertEqual((result.change, result.reasons, result.notes), (Change.UP, [], ['lab_differs']))
        self.assertEqual(result.labs, ('Delta Medical Labs', 'Nile Diagnostics Laboratory'))
        response = self.client.get(f'{BASE}reports/{later.id}/')
        [tsh] = response.data['values']
        self.assertEqual(tsh['comparison']['notes'], ['lab_differs'])
        self.assertEqual(tsh['comparison']['labs'], ['Delta Medical Labs', 'Nile Diagnostics Laboratory'])

    def test_another_lab_with_a_different_range_is_not_compared(self):
        self.read(['TSH 1.8 mIU/L 0.4 - 4.0'], name='july.pdf', collected='03/07/2026')
        later = self.read(['TSH 2.6 mIU/L 0.27 - 4.2'], name='october.pdf', lab='Delta Medical Labs')
        result = compare(self.value(later, 'tsh'))
        self.assertEqual(result.change, Change.NOT_COMPARABLE)
        self.assertEqual(result.reasons, ['lab_differs', 'reference_range_differs'])


class ReportTitleTests(ValueCheckTestCase):
    def test_an_upload_named_by_its_file_gets_a_report_title(self):
        report = self.read(pdfs.BLOODS, name='scan_0042.pdf')
        report.document.refresh_from_db()
        self.assertEqual(report.document.title,
                         'Menopause / perimenopause bloods · Nile Diagnostics Laboratory · 3 October 2026')

    def test_a_title_staff_gave_is_kept(self):
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab', title='October bloods',
            upload=SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.header() + pdfs.BLOODS), content_type='application/pdf'),
        )
        process_document(document)
        document.refresh_from_db()
        self.assertEqual(document.title, 'October bloods')


class ValueCheckInputTests(ValueCheckTestCase):
    def test_values_that_are_not_plain_numbers_are_refused_with_400(self):
        tsh = self.value(self.read([UNSURE_TSH]), 'tsh')
        for text in ('nan', 'NaN', 'inf', '-Infinity', '1e400', '1e5', '12345678901', '1.23456', '3,1,2', ''):
            with self.subTest(text=text):
                response = self.check(tsh, value_text=text)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        for text in ('3.1', '3,1', '<0.1', '-2', '1234567890.1234'):
            with self.subTest(text=text):
                self.assertEqual(self.check(tsh, value_text=text).status_code, status.HTTP_200_OK)
