import io
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image, ImageDraw, ImageFont

from apps.organizations.models import Organization
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.comparison import Change, compare
from product.results.models import InvestigationReport, ReportType, ResultValue
from product.results.pipeline import process_document
from product.results.tasks import read_report
from product.testing import PrivateStorageMixin, make_member

from . import pdfs

DOB = date(1974, 3, 9)


class PipelineTestCase(PrivateStorageMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=DOB)

    def upload(self, content: bytes, *, name='report.pdf', slot='lab', patient=None, content_type='application/pdf'):
        return store_document(
            organization=self.clinic, patient=patient or self.patient, uploaded_by=self.staff, slot=slot,
            upload=SimpleUploadedFile(name, content, content_type=content_type),
        )

    def read(self, lines, **kwargs) -> InvestigationReport:
        return process_document(self.upload(pdfs.make_pdf(lines), **kwargs))

    def values(self, report):
        return {v.lab_test.code if v.lab_test else v.raw_name: v for v in report.values.all()}


class ProcessDocumentTests(PipelineTestCase):
    def test_bloods_report_is_read_into_values(self):
        report = self.read(pdfs.header() + pdfs.BLOODS)
        self.assertEqual(report.status, InvestigationReport.Status.PARSED, report.flag_reasons)
        self.assertEqual(report.report_type, ReportType.MENOPAUSE_BLOODS)
        self.assertEqual((report.method, report.parser, report.match_status), ('text', 'generic', 'matched'))
        self.assertEqual(report.lab_name, 'Nile Diagnostics Laboratory')
        self.assertEqual(report.collected_on, date(2026, 10, 3))
        self.assertEqual(report.document.document_date, date(2026, 10, 3))
        self.assertTrue(report.in_history)
        values = self.values(report)
        self.assertEqual(sorted(values), ['estradiol', 'ferritin', 'fsh', 'hba1c', 'tsh'])
        ferritin = values['ferritin']
        self.assertEqual((ferritin.value_numeric, ferritin.unit, ferritin.flag), (Decimal('32.0'), 'ng/mL', 'L'))
        self.assertEqual(ferritin.result_date, date(2026, 10, 3))
        self.assertTrue(ferritin.is_abnormal)
        self.assertFalse(values['tsh'].is_abnormal)

    def test_sti_report(self):
        report = self.read(pdfs.header() + pdfs.STI)
        self.assertEqual(report.report_type, ReportType.INFECTION)
        values = self.values(report)
        self.assertEqual(values['chlamydia'].flag, 'A')
        self.assertEqual(values['gonorrhoea'].flag, 'N')

    def test_smears(self):
        normal = self.read(pdfs.header() + pdfs.SMEAR_NORMAL, name='normal.pdf')
        self.assertEqual((normal.report_type, normal.status), (ReportType.SMEAR_NORMAL, 'parsed'))
        self.assertEqual(self.values(normal)['cervical_cytology'].value_text, 'NILM')

        abnormal = self.read(pdfs.header() + pdfs.SMEAR_ABNORMAL, name='abnormal.pdf')
        self.assertEqual(abnormal.report_type, ReportType.SMEAR_ABNORMAL)
        self.assertEqual(self.values(abnormal)['cervical_cytology'].flag, 'A')

        unclear = self.read(pdfs.header() + pdfs.SMEAR_UNCLEAR, name='unclear.pdf')
        self.assertEqual((unclear.report_type, unclear.status), (ReportType.SMEAR_ABNORMAL, 'flagged'))
        self.assertIn('smear_result_unclear', unclear.flag_reasons)

    def test_report_for_another_birthday_is_flagged_and_kept_out_of_history(self):
        report = self.read(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS)
        self.assertEqual(report.status, InvestigationReport.Status.FLAGGED)
        self.assertEqual(report.match_status, 'uncertain')
        # Nobody in the clinic has that birthday, so the report cannot be this patient's.
        self.assertIn('patient_not_found', report.flag_reasons)
        self.assertFalse(report.in_history)

    def test_shared_birthday_with_a_different_name(self):
        create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1980, 1, 1))
        report = self.read(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS)
        self.assertIn('patient_name_date_of_birth_mismatch', report.flag_reasons)

    def test_report_naming_a_different_registered_patient(self):
        other = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1979, 6, 1))
        report = self.read(pdfs.header(name='Nour Saleh', dob='01/06/1979', file_number=other.file_number) + pdfs.BLOODS)
        self.assertEqual(report.flag_reasons, ['patient_other_file'])
        self.assertFalse(report.in_history)

    def test_report_without_identifiers_is_flagged(self):
        report = self.read(pdfs.header(name='', dob='', file_number='') + pdfs.BLOODS)
        self.assertIn('patient_identifiers_missing', report.flag_reasons)

    def test_unreadable_value_flags_the_report_but_keeps_history(self):
        report = self.read(pdfs.header() + pdfs.BLOODS + ['Vitamin D   ?? ng/mL'])
        self.assertEqual(report.flag_reasons, ['unreadable_value'])
        self.assertTrue(report.in_history)
        self.assertTrue(self.values(report)['vitamin_d'].unreadable)

    def test_document_with_no_results(self):
        report = self.read(['Dear colleague,', 'Thank you for seeing this patient.', 'Patient Name: Laila Ahmed',
                            'DOB: 09/03/1974'])
        self.assertEqual(report.status, InvestigationReport.Status.FLAGGED)
        self.assertEqual(set(report.flag_reasons), {'unknown_report_type', 'no_results_found', 'missing_result_date'})

    def test_damaged_pdf_is_flagged_not_crashed(self):
        report = process_document(self.upload(b'%PDF-1.4\nthis is not really a pdf'))
        self.assertEqual(report.status, InvestigationReport.Status.FLAGGED)
        self.assertEqual(report.flag_reasons, ['unreadable_document'])

    def test_scanned_image_is_read_with_ocr(self):
        image = Image.new('RGB', (1700, 700), 'white')
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=36)
        for row, line in enumerate(['Nile Diagnostics Laboratory', 'Patient Name: Laila Ahmed', 'DOB: 09/03/1974',
                                    'Collected: 03/10/2026', 'Ferritin    32.0  L  ng/mL   13 - 150']):
            draw.text((40, 40 + row * 80), line, fill='black', font=font)
        buffer = io.BytesIO()
        image.save(buffer, 'PNG')
        report = process_document(self.upload(buffer.getvalue(), name='scan.png', content_type='image/png'))
        self.assertEqual(report.method, 'ocr')
        self.assertEqual(report.match_status, 'matched')
        self.assertEqual(self.values(report)['ferritin'].value_numeric, Decimal('32.0'))

    def test_rereading_replaces_extracted_values_only(self):
        document = self.upload(pdfs.make_pdf(pdfs.header() + pdfs.BLOODS))
        report = process_document(document)
        ResultValue.objects.create(
            organization=self.clinic, patient=self.patient, report=report, raw_name='Typed', value_text='1',
            source=ResultValue.Source.MANUAL,
        )
        process_document(document)
        self.assertEqual(report.values.filter(source='extracted').count(), 5)
        self.assertEqual(report.values.filter(source='manual').count(), 1)


class ComparisonTests(PipelineTestCase):
    def test_follow_up_values_are_compared_with_the_previous_result(self):
        first = self.read(pdfs.header(collected='03/07/2026') + pdfs.BLOODS, name='july.pdf')
        later = pdfs.BLOODS[:]
        later[0] = 'Ferritin                  48.0      ng/mL      13 - 150'
        later[1] = 'TSH                       1.8       mIU/L      0.4 - 4.0'
        later[2] = 'HbA1c                     5.1       %          4.0 - 5.6'
        second = self.read(pdfs.header(collected='03/10/2026') + later, name='october.pdf')

        ferritin = compare(self.values(second)['ferritin'])
        self.assertEqual(ferritin.change, Change.UP)
        self.assertEqual(ferritin.previous.report_id, first.id)
        self.assertEqual(compare(self.values(second)['tsh']).change, Change.SAME)
        self.assertEqual(compare(self.values(second)['hba1c']).change, Change.DOWN)
        self.assertEqual(compare(self.values(first)['ferritin']).change, Change.FIRST)

    def test_different_unit_lab_or_range_is_not_compared(self):
        self.read(pdfs.header(collected='03/07/2026') + pdfs.BLOODS, name='july.pdf')
        changed = pdfs.header(collected='03/10/2026')
        changed[0] = 'Delta Medical Labs'
        changed += ['Ferritin 50 ug/L 15 - 200', 'TSH 2.0 mIU/L 0.4 - 4.0']
        second = self.read(changed, name='other-lab.pdf')
        result = compare(self.values(second)['ferritin'])
        self.assertEqual(result.change, Change.NOT_COMPARABLE)
        self.assertEqual(result.reasons, ['unit_differs', 'lab_differs', 'reference_range_differs'])
        self.assertIsNotNone(result.previous)

    def test_reports_outside_the_history_are_never_used_as_previous(self):
        self.read(pdfs.header(dob='01/01/1980', file_number='', collected='03/07/2026') + pdfs.BLOODS, name='x.pdf')
        second = self.read(pdfs.header() + pdfs.BLOODS, name='y.pdf')
        self.assertEqual(compare(self.values(second)['ferritin']).change, Change.FIRST)


class ReadReportTaskTests(PipelineTestCase):
    def test_reads_lab_reports_once_per_content(self):
        document = self.upload(pdfs.make_pdf(pdfs.header() + pdfs.BLOODS))
        with patch('product.results.pipeline.process_document', wraps=process_document) as process:
            first = read_report.apply(args=[str(document.pk)]).get()
            again = read_report.apply(args=[str(document.pk)]).get()
            reread = read_report.apply(args=[str(document.pk)], kwargs={'nonce': 'manual'}).get()
        self.assertEqual(process.call_count, 2)
        self.assertEqual(first, again)
        self.assertEqual(reread['status'], 'parsed')

    def test_other_categories_are_not_read(self):
        letter = self.upload(pdfs.make_pdf(['Referral letter']), slot='letter')
        self.assertIsNone(read_report.apply(args=[str(letter.pk)]).get())
        self.assertFalse(InvestigationReport.objects.exists())
