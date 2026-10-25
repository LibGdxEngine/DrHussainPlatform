"""Compare a result with the patient's previous result for the same test."""
from dataclasses import dataclass, field

from django.db.models import Q

from .models import ResultValue


class Change:
    FIRST = 'first'                # no earlier result: the normal results email applies
    UP = 'up'
    DOWN = 'down'
    SAME = 'same'
    CHANGED = 'changed'            # qualitative or text result that differs
    NOT_COMPARABLE = 'not_comparable'


@dataclass
class Comparison:
    change: str
    previous: ResultValue | None = None
    reasons: list[str] = field(default_factory=list)


def _norm(text: str) -> str:
    return ' '.join((text or '').replace('µ', 'u').replace('μ', 'u').casefold().split())


def previous_result(value: ResultValue) -> ResultValue | None:
    """The most recent earlier value for this test in the patient's history (never from the same report)."""
    if value.lab_test_id is None:
        return None
    earlier = ResultValue.objects.filter(
        patient_id=value.patient_id, lab_test_id=value.lab_test_id, report__in_history=True, unreadable=False,
    ).exclude(report_id=value.report_id).select_related('report')
    if value.result_date:
        earlier = earlier.filter(Q(result_date__lt=value.result_date) | Q(
            result_date=value.result_date, report__created_at__lt=value.report.created_at,
        ))
    else:
        earlier = earlier.filter(report__created_at__lt=value.report.created_at)
    return earlier.order_by('-result_date', '-report__created_at').first()


def compare(value: ResultValue) -> Comparison:
    previous = previous_result(value)
    if previous is None:
        return Comparison(Change.FIRST)

    # Unlike results are shown side by side for the doctor; a change is never stated.
    reasons = []
    if _norm(value.unit) != _norm(previous.unit):
        reasons.append('unit_differs')
    if _norm(value.lab_name) != _norm(previous.lab_name):
        reasons.append('lab_differs')
    if (value.ref_low, value.ref_high, _norm(value.ref_text)) != (previous.ref_low, previous.ref_high, _norm(previous.ref_text)):
        reasons.append('reference_range_differs')
    if value.unreadable:
        reasons.append('value_unreadable')
    censored = any(v.value_text[:1] in '<>≤≥' for v in (value, previous))
    if censored:
        reasons.append('value_is_a_limit')
    if reasons:
        return Comparison(Change.NOT_COMPARABLE, previous, reasons)

    if value.value_numeric is not None and previous.value_numeric is not None:
        if value.value_numeric > previous.value_numeric:
            return Comparison(Change.UP, previous)
        if value.value_numeric < previous.value_numeric:
            return Comparison(Change.DOWN, previous)
        return Comparison(Change.SAME, previous)
    same = _norm(value.value_text) == _norm(previous.value_text)
    return Comparison(Change.SAME if same else Change.CHANGED, previous)
