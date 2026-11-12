"""Check a patient's results, examinations and form answers against the clinic's alert rules."""
import logging
import operator
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.utils import timezone

from product.content.models import AlertRule, LabCheck, VitalSign
from product.medicines import matches_terms
from product.results.models import ResultValue

from .models import PatientAlert

logger = logging.getLogger(__name__)

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
        ResultValue.objects.filter(patient=patient, lab_test__code__in=codes, report__in_history=True, unreadable=False,
                                   needs_check=False)
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


def _is_lab_rule(version) -> bool:
    return bool(version.lab_check and (version.lab_test_code or version.vital))


def _answer_inputs(patient):
    """(PatientHistory, current medicine names): what the answer rules and medicine terms read."""
    from product.intake.history import patient_history
    from product.medicines import current_medicine_names

    history = patient_history(patient)
    return history, current_medicine_names(patient, history=history)


def _evaluate_rule(version, patient, latest_values, examinations, answers):
    """
    (fires, value, examination, form, detail) for one rule version. A rule with both a lab or vitals
    check and an answer check fires when either part fires; each part that fired adds its detail and
    the result, examination or form it read. A lab or vitals part with medicine_terms fires only when
    one of the patient's current medicines matches them.
    """
    if not version.enabled:
        return False, None, None, None, ''
    value = examination = form = None
    lab_fires = answer_fires = False
    details = []
    if _is_lab_rule(version):
        if version.vital:
            lab_fires, examination, lab_detail = _vital_fires(version, examinations)
        else:
            lab_fires, value, lab_detail = _fires(version, patient, latest_values)
        if lab_fires and version.medicine_terms:
            matched = matches_terms(answers()[1], version.medicine_terms)
            lab_fires = bool(matched)
            lab_detail = f'{lab_detail}; {", ".join(matched)}'
        if lab_fires:
            details.append(lab_detail)
        else:
            value = examination = None
    if version.answer_check:
        from .answer_rules import REGISTRY

        history, medicine_names = answers()
        answer_fires, form, answer_detail = REGISTRY[version.answer_check](history, version, medicine_names)
        if answer_fires:
            details.append(answer_detail)
        else:
            form = None
    return lab_fires or answer_fires, value, examination, form, '; '.join(d for d in details if d)


@transaction.atomic
def evaluate_patient(patient, errors=None) -> list[PatientAlert]:
    """
    Run every enabled lab, vitals and answer rule for the patient. New alerts open; open alerts that
    a later result, examination or form no longer supports are resolved. Acknowledged alerts are not
    raised again for the same result, examination or form.

    A rule that raises is logged and appended to `errors` ({'rule': code, 'error': exception name});
    its open alert is left as it was and the other rules still run.
    """
    errors = [] if errors is None else errors
    opened = []
    rules = AlertRule.objects.filter(organization=patient.organization).prefetch_related('versions')
    checks = []
    for rule in rules:
        # The newest version, from the prefetched list (rule.current would query per rule).
        version = max(rule.versions.all(), key=lambda v: v.number, default=None)
        if version is not None and (version.answer_check or _is_lab_rule(version)):
            checks.append((rule, version))
    if not checks:
        return opened
    lab_rules = [v for _, v in checks if _is_lab_rule(v)]
    latest_values = _latest_values(patient, {v.lab_test_code for v in lab_rules if v.lab_test_code})
    examinations = _latest_examinations(patient) if any(v.vital for v in lab_rules) else []

    # The answers and medicines are read once, and only when a rule needs them.
    inputs = {}

    def answers():
        if 'value' not in inputs:
            try:
                with transaction.atomic():
                    inputs['value'] = _answer_inputs(patient)
            except Exception as exc:  # noqa: BLE001 - recorded per rule below
                inputs['value'] = exc
        if isinstance(inputs['value'], Exception):
            raise inputs['value']
        return inputs['value']

    open_alerts = {
        alert.rule_id: alert for alert in
        PatientAlert.objects.select_for_update().filter(patient=patient, status=PatientAlert.Status.OPEN)
    }
    for rule, version in checks:
        open_alert = open_alerts.get(rule.pk)
        try:
            fires, value, examination, form, detail = _evaluate_rule(
                version, patient, latest_values, examinations, answers)
        except Exception as exc:  # noqa: BLE001 - one broken rule must not stop the others
            logger.exception('Alert rule %s could not be checked for patient %s', rule.code, patient.pk)
            errors.append({'rule': rule.code, 'error': type(exc).__name__})
            continue
        if fires:
            if open_alert is not None:
                # Still firing, from a newer result, examination or form: show what fires it now.
                if (open_alert.value_id, open_alert.examination_id, open_alert.intake_form_id) != (
                        getattr(value, 'pk', None), getattr(examination, 'pk', None), getattr(form, 'pk', None)):
                    open_alert.value, open_alert.examination, open_alert.intake_form = value, examination, form
                    open_alert.detail = detail[:255]
                    open_alert.report = value.report if value else None
                    open_alert.save(update_fields=['value', 'examination', 'intake_form', 'detail', 'report',
                                                   'updated_at'])
                continue
            # Acknowledged for this same result, examination or form: not raised again until a new one.
            already_seen = PatientAlert.objects.filter(
                patient=patient, rule=rule, status=PatientAlert.Status.ACKNOWLEDGED, value=value,
                examination=examination, intake_form=form,
            ).exists()
            if already_seen:
                continue
            try:
                with transaction.atomic():
                    opened.append(PatientAlert.objects.create(
                        organization=patient.organization, patient=patient, rule=rule, rule_version=version,
                        level=version.level, message=version.message, value=value, examination=examination,
                        intake_form=form, report=value.report if value else None, detail=detail[:255],
                    ))
            except IntegrityError:
                # Another evaluation opened this alert in the meantime; one open alert is the rule.
                continue
        elif open_alert is not None:
            open_alert.status, open_alert.closed_at = PatientAlert.Status.RESOLVED, timezone.now()
            open_alert.save(update_fields=['status', 'closed_at', 'updated_at'])
    return opened


def _stamp(patient, form, errors) -> None:
    """Record on the form (default: the patient's latest complete form) whether the rules ran cleanly."""
    from product.intake.history import latest_complete_form
    from product.intake.models import IntakeForm

    if form is None:
        form = latest_complete_form(patient)
        if form is None:
            return
    if errors:
        fields = {'rule_errors': errors}
    else:
        fields = {'rules_evaluated_at': timezone.now(), 'rule_errors': []}
    IntakeForm.objects.filter(pk=form.pk).update(**fields, updated_at=timezone.now())
    for name, value in fields.items():
        setattr(form, name, value)


def evaluate_patient_safely(patient, form=None, *, reroute=True, exclude_case=None) -> list[dict]:
    """
    Run the patient's rules without ever raising: after a form is submitted, an order issued or an
    email sent, and from "Check alerts now". Each failing rule, or the whole run, is logged and
    written to `form.rule_errors` (default: the latest complete form); an error-free run stamps
    `rules_evaluated_at` and clears `rule_errors`. Returns the errors ({'rule', 'error'}; empty when
    every rule ran), also when the patient has no complete form to record them on.

    Then (unless `reroute` is False) the patient's open results cases are routed again, so a case
    the new alerts or errors would stop at sending shows it, and one they no longer hold is released.
    `exclude_case` is the case the caller is routing itself.
    """
    errors = []
    try:
        evaluate_patient(patient, errors=errors)
    except Exception as exc:  # noqa: BLE001 - the caller's work (a submit, a send) is already saved
        logger.exception('Alert rules could not be checked for patient %s', patient.pk)
        errors.append({'rule': 'all', 'error': type(exc).__name__})
    try:
        _stamp(patient, form, errors)
    except Exception:  # noqa: BLE001
        logger.exception('Could not record the alert rule run for patient %s', patient.pk)
    if reroute:
        from product.review.services import reroute_open_cases

        reroute_open_cases(patient, rule_errors=errors, exclude=exclude_case)  # never raises
    return errors


def evaluate_clinic(organization) -> int:
    """Run the rules for every patient in the clinic, e.g. after a cut-off changed. Returns how many."""
    from product.patients.models import Patient

    count = 0
    for patient in Patient.objects.filter(organization=organization).iterator(chunk_size=200):
        evaluate_patient_safely(patient)
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
