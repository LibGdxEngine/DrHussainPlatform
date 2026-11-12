"""
A patient's answers across their complete forms, as the alert rules read them.

Scopes:
    latest(qid)  the answer on the newest COMPLETE form that showed qid (None if it was left blank).
    merged(qid)  newest-first across complete forms: the answer from the newest form that answered qid.
                 A form that showed a carry-forward question (the form prefills those, and the medicine
                 lists) decides it even when left blank: the patient emptied it. A blank answer to any
                 other question does not hide an older one.
A form that did not show qid never clears it ("not shown" is not "cleared"), with one exception: a
dependent question (its show_if reads only other answers, e.g. the LNG-IUS date under contraception)
is void from a form that showed every answer its show_if reads and found the condition false.
A legacy form (empty `shown_questions`, submitted before it was recorded) counts as having shown
every key it holds an answer for, never clears an older answer and never voids one.
"""
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from django.db.models import F
from django.utils import timezone

from product.patients.models import Patient

from .catalogue import NOT_SURE, QUESTIONS, holds, is_blank, is_prefilled
from .models import MRS_ITEMS, IntakeForm

_MONTHS = {name: n for n, name in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], start=1)}


def age_on(date_of_birth: date | None, on: date) -> int | None:
    if date_of_birth is None:
        return None
    return on.year - date_of_birth.year - ((on.month, on.day) < (date_of_birth.month, date_of_birth.day))


def parse_period_date(text) -> date | None:
    """A date from the free-text last-period answer ("2025-08-14", "2025-08", "Aug 2025", "2025"), or None."""
    if not isinstance(text, str):
        return None
    text = text.strip().lower()
    try:
        return date.fromisoformat(text)
    except ValueError:
        pass
    if match := re.fullmatch(r'(\d{4})-(\d{1,2})', text):
        year, month = int(match[1]), int(match[2])
        return date(year, month, 15) if 1 <= month <= 12 else None
    if match := re.fullmatch(r'([a-z]+)\.?,?\s+(\d{4})', text):
        month = _MONTHS.get(match[1][:3])
        return date(int(match[2]), month, 15) if month else None
    if match := re.fullmatch(r'(\d{1,2})/(\d{4})', text):
        month = int(match[1])
        return date(int(match[2]), month, 15) if 1 <= month <= 12 else None
    if re.fullmatch(r'\d{4}', text):
        return date(int(text), 7, 1)
    return None


def form_showed(form: IntakeForm, qid: str) -> bool:
    if form.shown_questions:
        return qid in form.shown_questions
    return qid in (form.answers or {})


def _answer(form: IntakeForm, qid: str) -> Any:
    value = (form.answers or {}).get(qid)
    return None if is_blank(value) else value


def _answers_read(condition: dict) -> set[str] | None:
    """The question ids a condition reads, or None when it also reads the age, the open sections or a constant."""
    if 'all' in condition or 'any' in condition:
        parts = [_answers_read(c) for c in condition.get('all', condition.get('any', []))]
        return None if any(p is None for p in parts) else set().union(*parts)
    if 'not' in condition:
        return _answers_read(condition['not'])
    if 'answer' in condition:
        return {condition['answer']}
    if 'answered' in condition:
        return {condition['answered']}
    return None


def _void_on(form: IntakeForm, qid: str) -> bool:
    """
    Whether this recorded form voids the dependent answer qid: it did not show qid, it showed every
    answer qid's show_if reads, and the condition was false there.
    """
    condition = (QUESTIONS.get(qid) or {}).get('show_if')
    if not condition or not form.shown_questions or qid in form.shown_questions:
        return False
    read = _answers_read(condition)
    if not read or not read <= set(form.shown_questions):
        return False
    return not holds(condition, form.answers or {}, None, set())


@dataclass
class PatientHistory:
    patient: Patient
    # The patient's complete forms, newest first.
    forms: list[IntakeForm] = field(default_factory=list)

    def _read(self, qid: str, *, merged: bool) -> tuple[IntakeForm | None, Any]:
        """(the form that decides qid, its answer) for the scope; (None, None) when no form does."""
        for form in self.forms:
            if not form.shown_questions:  # legacy
                value = _answer(form, qid)
                if value is not None or (not merged and qid in (form.answers or {})):
                    return form, value
                continue
            if qid in form.shown_questions:
                value = _answer(form, qid)
                if value is not None or not merged or is_prefilled(QUESTIONS.get(qid)):
                    return form, value
                continue
            if _void_on(form, qid):
                return None, None
        return None, None

    def latest_form(self, qid: str) -> IntakeForm | None:
        """The newest complete form that showed qid (the form `latest(qid)` read), or None."""
        return self._read(qid, merged=False)[0]

    def latest(self, qid: str) -> Any:
        return self._read(qid, merged=False)[1]

    def merged(self, qid: str) -> Any:
        return self._read(qid, merged=True)[1]

    def form_for(self, qid: str) -> IntakeForm | None:
        """The complete form that supplied the answer to qid (the form `merged(qid)` read), or None."""
        form, value = self._read(qid, merged=True)
        return form if value is not None else None

    @property
    def mrs(self) -> list[int] | None:
        """The newest complete form's MRS item scores (11 items, 0-4), or None."""
        form = self.mrs_form
        return list(form.mrs) if form else None

    @property
    def mrs_form(self) -> IntakeForm | None:
        """The form `mrs` came from."""
        return next((f for f in self.forms if f.mrs and len(f.mrs) == MRS_ITEMS), None)

    @property
    def age(self) -> int | None:
        """The patient's age in whole years today."""
        return age_on(self.patient.date_of_birth, timezone.localdate())

    @property
    def postmenopausal(self) -> bool:
        """Periods stopped (newest answer), or a year or more since the last period or menopause."""
        if self.merged('period_status') == 'stopped':
            return True
        years = self.years_since_lmp
        return years is not None and years >= 1

    @property
    def years_since_lmp(self) -> float | None:
        """Years since the last period (or menopause), or None when the answers do not say."""
        today = timezone.localdate()
        last_period = parse_period_date(self.merged('last_period'))
        if last_period is not None and last_period <= today:
            return (today - last_period).days / 365.25
        menopause_age, age = self.merged('menopause_age'), self.age
        if menopause_age not in (None, NOT_SURE) and age is not None and age >= menopause_age:
            return float(age - menopause_age)
        return None


def complete_forms(patient: Patient):
    """The patient's complete forms, newest first (unsubmitted ones last): the one order every reader uses."""
    return (IntakeForm.objects.filter(patient=patient, status=IntakeForm.Status.COMPLETE)
            .order_by(F('submitted_at').desc(nulls_last=True), '-created_at'))


def latest_complete_form(patient: Patient) -> IntakeForm | None:
    """The patient's newest complete form, or None."""
    return complete_forms(patient).first()


def patient_history(patient: Patient) -> PatientHistory:
    return PatientHistory(patient=patient, forms=list(complete_forms(patient)))
