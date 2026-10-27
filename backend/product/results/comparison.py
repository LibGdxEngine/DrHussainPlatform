"""Compare a result with the patient's previous result for the same test."""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

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


def _is_earlier(candidate: ResultValue, value: ResultValue) -> bool:
    """The same rule as previous_result's query, applied in Python to a batch."""
    if candidate.report_id == value.report_id:
        return False
    if value.result_date is not None:
        if candidate.result_date is None:
            return False
        return (candidate.result_date, candidate.report.created_at) < (value.result_date, value.report.created_at)
    return candidate.report.created_at < value.report.created_at


def previous_results(values) -> dict:
    """
    {value pk: its previous value or None} for a whole batch from one query, for the pages that
    compare every value of a report or a patient's history at once.
    """
    previous = {v.pk: None for v in values}
    wanted = [v for v in values if v.lab_test_id is not None]
    if not wanted:
        return previous
    history = ResultValue.objects.filter(
        patient_id__in={v.patient_id for v in wanted}, lab_test_id__in={v.lab_test_id for v in wanted},
        report__in_history=True, unreadable=False,
    ).select_related('report')
    by_test = defaultdict(list)
    for candidate in history:
        by_test[(candidate.patient_id, candidate.lab_test_id)].append(candidate)
    for value in wanted:
        earlier = [c for c in by_test[(value.patient_id, value.lab_test_id)] if _is_earlier(c, value)]
        previous[value.pk] = max(earlier, key=lambda c: (c.result_date or date.min, c.report.created_at), default=None)
    return previous


def compare_many(values) -> dict:
    """{value pk: Comparison} for a batch, looking previous results up once rather than per value."""
    previous = previous_results(values)
    return {v.pk: compare(v, previous[v.pk]) for v in values}


_LOOK_UP = object()


def compare(value: ResultValue, previous=_LOOK_UP) -> Comparison:
    if previous is _LOOK_UP:
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
