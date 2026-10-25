"""Check a patient's results against the clinic's lab alert rules."""
import operator
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from product.content.models import AlertRule, LabCheck
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


def _latest(patient, code):
    """The newest usable value of a test in the patient's history."""
    return (
        ResultValue.objects.filter(patient=patient, lab_test__code=code, report__in_history=True, unreadable=False)
        .select_related('report').order_by('-result_date', '-report__created_at').first()
    )


def _fires(version, patient):
    """(fires, value, detail) for one rule version."""
    code, check = version.lab_test_code, version.lab_check
    latest = _latest(patient, code)
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


@transaction.atomic
def evaluate_patient(patient) -> list[PatientAlert]:
    """
    Run every enabled lab rule for the patient. New alerts open; open alerts that a later result
    no longer supports are resolved. Acknowledged alerts are not raised again for the same result.
    """
    opened = []
    rules = AlertRule.objects.filter(organization=patient.organization).prefetch_related('versions')
    for rule in rules:
        version = rule.current
        if version is None or not version.lab_check or not version.lab_test_code:
            continue
        open_alert = PatientAlert.objects.select_for_update().filter(patient=patient, rule=rule,
                                                                     status=PatientAlert.Status.OPEN).first()
        fires = version.enabled and _fires(version, patient)
        if fires and fires[0]:
            _, value, detail = fires
            if open_alert is not None:
                continue
            already_seen = PatientAlert.objects.filter(
                patient=patient, rule=rule, status=PatientAlert.Status.ACKNOWLEDGED, value=value,
            ).exists()
            if already_seen:
                continue
            opened.append(PatientAlert.objects.create(
                organization=patient.organization, patient=patient, rule=rule, rule_version=version,
                level=version.level, message=version.message, value=value,
                report=value.report if value else None, detail=detail[:255],
            ))
        elif open_alert is not None:
            open_alert.status, open_alert.closed_at = PatientAlert.Status.RESOLVED, timezone.now()
            open_alert.save(update_fields=['status', 'closed_at', 'updated_at'])
    return opened


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
