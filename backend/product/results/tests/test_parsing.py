from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from product.results.extraction.classify import classify
from product.results.extraction.parsing import (
    parse_collected_on, parse_date, parse_identifiers, parse_lab_name, parse_rows,
)
from product.results.models import ReportType

KNOWN = {'ferritin', 'tsh', 'vitamin d', 'chlamydia trachomatis', 'candida', 'hba1c'}


def known(name):
    return name.casefold().strip() in KNOWN


class ParseRowsTests(SimpleTestCase):
    def rows(self, *lines):
        return parse_rows('\n'.join(lines), known)

    def test_value_unit_range_and_printed_flag(self):
        [row] = self.rows('Ferritin      32.0  L   ng/mL    13 - 150')
        self.assertEqual((row.name, row.value_numeric, row.unit), ('Ferritin', Decimal('32.0'), 'ng/mL'))
        self.assertEqual((row.ref_low, row.ref_high, row.flag), (Decimal('13'), Decimal('150'), 'L'))

    def test_flag_is_worked_out_from_the_range_when_not_printed(self):
        high, normal = self.rows('TSH 5.1 mIU/L 0.4-4.0', 'TSH 1.8 mIU/L (0.4 - 4.0)')
        self.assertEqual((high.flag, normal.flag), ('H', 'N'))

    def test_unit_after_range_and_upper_bound_only(self):
        unit_last, bound = self.rows('Ferritin 32 13 - 150 ng/mL', 'HbA1c 5.9 % <5.7')
        self.assertEqual(unit_last.unit, 'ng/mL')
        self.assertEqual((bound.ref_low, bound.ref_high, bound.flag), (None, Decimal('5.7'), 'H'))

    def test_limits_are_never_given_a_computed_flag(self):
        [row] = self.rows('TSH <0.01 mIU/L 0.4 - 4.0')
        self.assertEqual((row.value_text, row.flag), ('<0.01', ''))

    def test_comma_decimals(self):
        [row] = self.rows('Ferritin 32,5 ng/mL 13 - 150')
        self.assertEqual(row.value_numeric, Decimal('32.5'))

    def test_qualitative_results_of_known_tests(self):
        detected, absent = self.rows('Chlamydia trachomatis: Detected', 'Candida   Not isolated')
        self.assertEqual((detected.value_text, detected.flag), ('Detected', 'A'))
        self.assertEqual((absent.value_text, absent.flag), ('Not isolated', 'N'))

    def test_headers_footers_and_unknown_words_are_skipped(self):
        rows = self.rows('Test Result Unit Range', 'Page 1 of 2', 'Age 52 Y', 'Result: Negative',
                         'Collected 03/10/2026')
        self.assertEqual(rows, [])

    def test_unknown_test_with_unit_and_range_is_kept_for_the_doctor(self):
        [row] = self.rows('Zinc 70 ug/dL 60 - 120')
        self.assertEqual((row.name, row.unit), ('Zinc', 'ug/dL'))

    def test_known_test_without_a_readable_value_is_marked_unreadable(self):
        [row] = self.rows('Vitamin D   ?? ng/mL')
        self.assertTrue(row.unreadable)
        self.assertEqual(row.value_text, '?? ng/mL')

    def test_ocr_unit_misreads_are_corrected(self):
        [row] = self.rows('TSH 1.8 mlU/L 0.4- 4.0')
        self.assertEqual(row.unit, 'mIU/L')


class IdentifierTests(SimpleTestCase):
    TEXT = '\n'.join([
        'Nile Diagnostics Laboratory',
        'Referring doctor name: Dr. Gohar',
        'Patient Name: Laila Ahmed      Age: 52 Y',
        'DOB: 9-Mar-1974     File No: vc-000142',
        'Collected on: 03/10/2026   Reported: 04/10/2026',
    ])

    def test_reads_patient_identifiers_but_not_the_doctor(self):
        self.assertEqual(parse_identifiers(self.TEXT), {
            'name': 'Laila Ahmed', 'date_of_birth': '1974-03-09', 'file_number': 'VC-000142',
        })

    def test_prefers_collection_date_over_report_date(self):
        self.assertEqual(parse_collected_on(self.TEXT), date(2026, 10, 3))
        self.assertEqual(parse_collected_on('Reported: 04/10/2026'), date(2026, 10, 4))

    def test_lab_name(self):
        self.assertEqual(parse_lab_name(self.TEXT), 'Nile Diagnostics Laboratory')

    def test_dates_are_day_first(self):
        self.assertEqual(parse_date('03/10/2026'), date(2026, 10, 3))
        self.assertEqual(parse_date('2026-10-03'), date(2026, 10, 3))
        self.assertEqual(parse_date('3 Oct 2026'), date(2026, 10, 3))
        self.assertIsNone(parse_date('31/02/2026'))
        self.assertIsNone(parse_date('soon'))


class ClassifyTests(SimpleTestCase):
    def test_normal_smear(self):
        result = classify('Cervical cytology. Negative for intraepithelial lesion or malignancy', set(), False)
        self.assertEqual((result.report_type, result.smear_finding), (ReportType.SMEAR_NORMAL, 'NILM'))

    def test_abnormal_smear_wins_over_normal_wording(self):
        text = 'Liquid based cytology. LSIL. HPV negative for intraepithelial lesion elsewhere'
        result = classify(text, set(), False)
        self.assertEqual((result.report_type, result.smear_finding), (ReportType.SMEAR_ABNORMAL, 'LSIL'))

    def test_unclear_smear_is_treated_as_abnormal_and_flagged(self):
        result = classify('Pap smear. See comment.', set(), False)
        self.assertEqual(result.report_type, ReportType.SMEAR_ABNORMAL)
        self.assertEqual(result.flags, ['smear_result_unclear'])

    def test_blood_panel_with_a_negative_swab_stays_a_blood_report(self):
        codes = {'fsh', 'ferritin', 'chlamydia'}
        self.assertEqual(classify('', codes, True).report_type, ReportType.MENOPAUSE_BLOODS)
        self.assertEqual(classify('', codes, True, {'chlamydia'}).report_type, ReportType.INFECTION)

    def test_pathology_infection_menopause_bloods_unknown(self):
        self.assertEqual(classify('Histopathology report. Biopsy.', set(), False).report_type, ReportType.PATHOLOGY)
        self.assertEqual(classify('', {'chlamydia'}, False).report_type, ReportType.INFECTION)
        self.assertEqual(classify('High vaginal swab', set(), False).report_type, ReportType.INFECTION)
        self.assertEqual(classify('', {'fsh', 'tsh'}, True).report_type, ReportType.MENOPAUSE_BLOODS)
        self.assertEqual(classify('', {'tsh'}, True).report_type, ReportType.BLOODS)
        unknown = classify('Letter', set(), False)
        self.assertEqual((unknown.report_type, unknown.flags), (ReportType.UNKNOWN, ['unknown_report_type']))
