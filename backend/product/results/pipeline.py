"""Read an uploaded report into results: text, rows, patient check, report type and flags."""
import logging

from django.db import transaction
from django.utils import timezone

from product.patients.services import match_patient
from product.records.models import Document, DocumentSlot

from .catalog import Catalog
from .extraction.classify import classify
from .extraction.parsers import choose_parser
from .extraction.parsing import parse_date
from .extraction.text import ExtractionError, extract_text
from .models import InvestigationReport, LabTest, ResultValue

logger = logging.getLogger(__name__)

# Only these categories hold investigation reports; letters, imaging and old notes are not read.
REPORT_SLOTS = {DocumentSlot.LAB, DocumentSlot.PATHOLOGY}
MAX_RAW_TEXT = 200_000


def should_read(document: Document) -> bool:
    return document.slot in REPORT_SLOTS


def schedule_reading(document: Document) -> None:
    """Queue the report to be read once the upload is committed."""
    if not should_read(document):
        return
    from .tasks import read_report

    transaction.on_commit(lambda: read_report.delay(str(document.pk)))


def check_patient(report: InvestigationReport, identifiers: dict) -> tuple[str, list[str]]:
    """Confirm the report names the patient whose file it was uploaded to."""
    if not identifiers:
        return 'missing', ['patient_identifiers_missing']
    match = match_patient(
        report.organization,
        date_of_birth=parse_date(identifiers.get('date_of_birth')),
        full_name=identifiers.get('name', ''),
        file_number=identifiers.get('file_number', ''),
    )
    if match.is_confirmed:
        if match.patient.pk == report.patient_id:
            return 'matched', []
        return 'other_patient', ['patient_other_file']
    return 'uncertain', [f'patient_{reason}' for reason in match.reasons]


def _unique(items):
    return list(dict.fromkeys(items))


def process_document(document: Document) -> InvestigationReport:
    """Read (or re-read) a report. Values typed in by staff are kept; extracted values are replaced."""
    report, _ = InvestigationReport.objects.get_or_create(
        document=document,
        defaults={'organization': document.organization, 'patient': document.patient},
    )
    catalog = Catalog(document.organization)
    flags: list[str] = []
    try:
        with document.file.open('rb') as handle:
            extracted = extract_text(handle, document.content_type)
    except ExtractionError as error:
        logger.info('Report %s could not be read (%s)', report.pk, error.code)
        return _save(report, flags=[error.code], method='', text='', parsed=None, catalog=catalog)

    parser = choose_parser(extracted.text)
    parsed = parser.parse(extracted.text, known_test=lambda name: catalog.resolve(name) is not None)
    report.parser = parser.key
    match_status, patient_flags = check_patient(report, parsed.identifiers)
    report.match_status = match_status
    flags.extend(patient_flags)
    return _save(report, flags=flags, method=extracted.method, text=extracted.text, parsed=parsed, catalog=catalog)


@transaction.atomic
def _save(report, *, flags, method, text, parsed, catalog) -> InvestigationReport:
    report.values.filter(source=ResultValue.Source.EXTRACTED).delete()
    report.method = method or report.method
    report.raw_text = text[:MAX_RAW_TEXT]
    report.processed_at = timezone.now()
    if parsed is None:
        report.report_type = 'unknown'
        report.identifiers = {}
    else:
        report.identifiers = parsed.identifiers
        report.lab_name = parsed.lab_name[:255]
        report.collected_on = parsed.collected_on or report.document.document_date
        document = report.document
        if document.document_date is None and report.collected_on:
            # Staff only have to fill the date in when the report does not show it.
            document.document_date = report.collected_on
            document.save(update_fields=['document_date', 'updated_at'])
        mapped = []
        for position, row in enumerate(parsed.rows):
            test = catalog.resolve(row.name)
            mapped.append(test)
            ResultValue.objects.create(
                organization=report.organization, patient=report.patient, report=report, lab_test=test,
                raw_name=row.name[:255], value_text=row.value_text[:255], value_numeric=row.value_numeric,
                unit=row.unit[:32], ref_low=row.ref_low, ref_high=row.ref_high, ref_text=row.ref_text[:128],
                flag=row.flag, result_date=report.collected_on, lab_name=report.lab_name,
                unreadable=row.unreadable, source=ResultValue.Source.EXTRACTED, position=position,
            )
        codes = {test.code for test in mapped if test is not None}
        positive = {test.code for test, row in zip(mapped, parsed.rows) if test is not None and row.flag == 'A'}
        has_numeric = any(row.value_numeric is not None for row in parsed.rows)
        classification = classify(text, codes, has_numeric, positive)
        report.report_type = classification.report_type
        flags.extend(classification.flags)
        if classification.smear_finding and 'cervical_cytology' not in codes:
            cytology = catalog.resolve('cervical cytology')
            ResultValue.objects.create(
                organization=report.organization, patient=report.patient, report=report, lab_test=cytology,
                raw_name='Cervical cytology', value_text=classification.smear_finding,
                flag='N' if classification.report_type == 'smear_normal' else 'A',
                result_date=report.collected_on, lab_name=report.lab_name, position=len(parsed.rows),
            )
        if not parsed.rows and not classification.smear_finding:
            flags.append('no_results_found')
        if any(row.unreadable for row in parsed.rows):
            flags.append('unreadable_value')
        if report.collected_on is None:
            flags.append('missing_result_date')
    if report.status != InvestigationReport.Status.CONFIRMED:
        report.flag_reasons = _unique(flags)
        report.status = InvestigationReport.Status.FLAGGED if report.flag_reasons else InvestigationReport.Status.PARSED
    report.refresh_history_eligibility()
    report.save()
    return report


@transaction.atomic
def save_manual_values(*, document: Document, result_date, entries: list[tuple[LabTest, str, str]], user):
    """
    Store values staff typed in from a report. Each entry is (test, value, unit); an empty value
    removes that test's typed value. The report record is created if the file was never read.
    """
    from .extraction.parsing import qualitative_flag, to_decimal

    report, created = InvestigationReport.objects.get_or_create(
        document=document,
        defaults={
            'organization': document.organization, 'patient': document.patient,
            'method': InvestigationReport.Method.MANUAL, 'status': InvestigationReport.Status.PARSED,
            'match_status': 'manual', 'report_type': 'bloods', 'collected_on': result_date,
        },
    )
    if result_date and report.collected_on != result_date:
        report.collected_on = result_date
    for test, value, unit in entries:
        report.values.filter(source=ResultValue.Source.MANUAL, lab_test=test).delete()
        value = value.strip()
        if not value:
            continue
        numeric = to_decimal(value) if test.kind == LabTest.Kind.NUMERIC else None
        flag = qualitative_flag(value) if test.kind == LabTest.Kind.QUALITATIVE else ''
        ResultValue.objects.create(
            organization=report.organization, patient=report.patient, report=report, lab_test=test,
            raw_name=test.name, value_text=value[:255], value_numeric=numeric,
            unit=(unit or test.default_unit)[:32], flag=flag, result_date=report.collected_on,
            lab_name=report.lab_name, source=ResultValue.Source.MANUAL, entered_by=user,
            position=1000 + test.sort_order,
        )
    report.values.filter(source=ResultValue.Source.MANUAL).update(result_date=report.collected_on)
    if created:
        report.refresh_history_eligibility()
    report.save()
    return report
