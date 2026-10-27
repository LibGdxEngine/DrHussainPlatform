"""Check a patient's results and examinations against the clinic's alert rules."""
import operator
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.utils import timezone

from product.content.models import AlertRule, LabCheck, VitalSign
from product.results.models import ResultValue

from .models import PatientAlert

_COMPARE = {
    LabCheck.ABOVE: operator.gt,
    LabCheck.AT_OR_ABOVE: operator.ge,
    LabCheck.BELOW: operator.lt,
    LabCheck.AT_OR_BELOW: operator.le,
}
_SYMBOL = {LabCheck.ABOVE: '>', LabCheck.AT_OR_ABOVE: '≥', LabCheck.BELOW: '<', LabCheck.AT_OR_BELOW: '≤'}


def _cut_off(text):
    try:
        return Decimal((text or '').strip().replace(',', '.'))
    except InvalidOperation:
        return None  # e.g. "[set]": the clinic has not chosen a value yet


def _latest_values(patient, codes) -> dict:
    """{test code: the newest usable value in the patient's history}, for all the rules' tests at once."""
    latest = {}
    values = (
        ResultValue.objects.filter(patient=patient, lab_test__code__in=codes, report__in_history=True, unreadable=False)
        .select_related('report', 'lab_test').order_by('-result_date', '-report__created_at')
    )
    for value in values:
        latest.setdefault(value.lab_test.code, value)
    return latest


def _fires(version, patient, latest_values=None):
    """(fires, value, detail) for one rule version."""
    code, check = version.lab_test_code, version.lab_check
    if latest_values is None:
        latest_values = _latest_values(patient, [code])
    latest = latest_values.get(code)
    if check == LabCheck.NEVER_MEASURED:
        return latest is None, None, 'Never measured'
    compare = _COMPARE.get(check)
    cut_off = _cut_off(version.threshold_a)
    if compare is None or cut_off is None or latest is None or latest.value_numeric is None:
        return False, latest, ''
    if latest.value_text[:1] in '<>≤≥':
        return False, latest, ''  # a limit such as "<0.1" is not compared
    detail = f'{latest.value_text} {latest.unit} {_SYMBOL[check]} {version.threshold_a}'.replace('  ', ' ')
    return compare(latest.value_numeric, cut_off), latest, detail


def _latest_examinations(patient) -> list:
    from product.records.models import Examination

    return list(Examination.objects.filter(patient=patient).order_by('-examined_on', '-created_at')[:20])


def _vital_reading(examination, vital):
    if vital == VitalSign.BLOOD_PRESSURE:
        return examination.bp_average
    if vital == VitalSign.BMI:
        return examination.bmi
    return examination.waist_cm if vital == VitalSign.WAIST else None


def _vital_fires(version, examinations):
    """(fires, examination, detail) for a rule on the newest examination that measured its vital sign."""
    examination, reading = next(
        ((e, r) for e in examinations if (r := _vital_reading(e, version.vital)) is not None), (None, None))
    compare = _COMPARE.get(version.lab_check)
    cut_off = _cut_off(version.threshold_a)
    if compare is None or cut_off is None or reading is None:
        return False, examination, ''
    symbol = _SYMBOL[version.lab_check]
    if version.vital == VitalSign.BLOOD_PRESSURE:
        systolic, diastolic = reading
        diastolic_cut_off = _cut_off(version.threshold_b)
        fires = compare(systolic, cut_off) or (diastolic_cut_off is not None and compare(diastolic, diastolic_cut_off))
        limit = version.threshold_a + (f'/{version.threshold_b}' if diastolic_cut_off is not None else '')
        return fires, examination, f'BP {systolic}/{diastolic} {symbol} {limit}'
    label = 'BMI' if version.vital == VitalSign.BMI else 'Waist'
    unit = ' cm' if version.vital == VitalSign.WAIST else ''
    return compare(reading, cut_off), examination, f'{label} {reading.normalize():f}{unit} {symbol} {version.threshold_a}{unit}'


@transaction.atomic
def evaluate_patient(patient) -> list[PatientAlert]:
    """
    Run every enabled lab and vitals rule for the patient. New alerts open; open alerts that a later
    result or examination no longer supports are resolved. Acknowledged alerts are not raised again
    for the same result or examination.
    """
    opened = []
    rules = AlertRule.objects.filter(organization=patient.organization).prefetch_related('versions')
    checks = []
    for rule in rules:
        # The newest version, from the prefetched list (rule.current would query per rule).
        version = max(rule.versions.all(), key=lambda v: v.number, default=None)
        if version is not None and version.lab_check and (version.lab_test_code or version.vital):
            checks.append((rule, version))
    if not checks:
        return opened
    latest_values = _latest_values(patient, {v.lab_test_code for _, v in checks if v.lab_test_code})
    examinations = _latest_examinations(patient) if any(v.vital for _, v in checks) else []
    open_alerts = {
        alert.rule_id: alert for alert in
        PatientAlert.objects.select_for_update().filter(patient=patient, status=PatientAlert.Status.OPEN)
    }
    for rule, version in checks:
        open_alert = open_alerts.get(rule.pk)
        if not version.enabled:
            fires, value, examination, detail = False, None, None, ''
        elif version.vital:
            fires, examination, detail = _vital_fires(version, examinations)
            value = None
        else:
            fires, value, detail = _fires(version, patient, latest_values)
            examination = None
        if fires:
            if open_alert is not None:
                # Still crossed, by a newer result or examination: show the reading that fires it now.
                if (open_alert.value_id, open_alert.examination_id) != (getattr(value, 'pk', None),
                                                                        getattr(examination, 'pk', None)):
                    open_alert.value, open_alert.examination, open_alert.detail = value, examination, detail[:255]
                    open_alert.report = value.report if value else None
                    open_alert.save(update_fields=['value', 'examination', 'detail', 'report', 'updated_at'])
                continue
            # Acknowledged for this same result or examination: not raised again until a new one.
            already_seen = PatientAlert.objects.filter(
                patient=patient, rule=rule, status=PatientAlert.Status.ACKNOWLEDGED, value=value,
                examination=examination,
            ).exists()
            if already_seen:
                continue
            try:
                with transaction.atomic():
                    opened.append(PatientAlert.objects.create(
                        organization=patient.organization, patient=patient, rule=rule, rule_version=version,
                        level=version.level, message=version.message, value=value, examination=examination,
                        report=value.report if value else None, detail=detail[:255],
                    ))
            except IntegrityError:
                # Another evaluation opened this alert in the meantime; one open alert is the rule.
                continue
        elif open_alert is not None:
            open_alert.status, open_alert.closed_at = PatientAlert.Status.RESOLVED, timezone.now()
            open_alert.save(update_fields=['status', 'closed_at', 'updated_at'])
    return opened


def evaluate_clinic(organization) -> int:
    """Run the rules for every patient in the clinic, e.g. after a cut-off changed. Returns how many."""
    from product.patients.models import Patient

    count = 0
    for patient in Patient.objects.filter(organization=organization).iterator(chunk_size=200):
        evaluate_patient(patient)
        count += 1
    return count


def acknowledge(alert: PatientAlert, *, user, reason: str) -> PatientAlert:
    alert.status = PatientAlert.Status.ACKNOWLEDGED
    alert.acknowledged_by, alert.acknowledged_at, alert.closed_at = user, timezone.now(), timezone.now()
    alert.reason = reason[:500]
    alert.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at', 'closed_at', 'reason', 'updated_at'])
    return alert


def open_red_alerts(report) -> list[str]:
    """Codes of open red alerts fired by this report: the case goes to the doctor first."""
    return list(
        PatientAlert.objects.filter(report=report, status=PatientAlert.Status.OPEN, level='red')
        .values_list('rule__code', flat=True)
    )
