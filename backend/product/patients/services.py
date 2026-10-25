import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction

from .models import FileNumberSequence, Patient

FILE_NUMBER_PREFIX = 'VC-'
_HONORIFICS = {'mrs', 'mr', 'ms', 'miss', 'dr', 'madam'}


def normalize_name(name: str) -> str:
    """Casefold, drop punctuation and titles, and collapse spaces: 'Mrs. Laila  AHMED' -> 'laila ahmed'."""
    text = unicodedata.normalize('NFKC', name or '').casefold()
    words = re.sub(r'[^\w\s]', ' ', text).split()
    return ' '.join(w for w in words if w not in _HONORIFICS)


def normalize_file_number(value: str) -> str:
    return (value or '').strip().upper()


def next_file_number(organization) -> str:
    """Issue the clinic's next file number; call inside a transaction."""
    sequence, _ = FileNumberSequence.objects.select_for_update().get_or_create(organization=organization)
    sequence.last_value += 1
    sequence.save(update_fields=['last_value'])
    return f'{FILE_NUMBER_PREFIX}{sequence.last_value:06d}'


def find_similar(organization, full_name: str, date_of_birth: date):
    """Existing files with the same name and date of birth, shown before a duplicate is created."""
    return Patient.objects.filter(
        organization=organization,
        normalized_name=normalize_name(full_name),
        date_of_birth=date_of_birth,
    )


@transaction.atomic
def create_patient(organization, **fields) -> Patient:
    return Patient.objects.create(
        organization=organization,
        file_number=next_file_number(organization),
        **fields,
    )


class MatchStatus:
    MATCHED = 'matched'
    UNCERTAIN = 'uncertain'
    NOT_FOUND = 'not_found'


@dataclass
class PatientMatch:
    status: str
    patient: Patient | None = None
    reasons: list[str] = field(default_factory=list)

    @property
    def is_confirmed(self) -> bool:
        return self.status == MatchStatus.MATCHED


def match_patient(organization, *, date_of_birth: date | None, full_name: str = '', file_number: str = '') -> PatientMatch:
    """
    Find the patient a report belongs to. Date of birth is the anchor, but many patients share one,
    so it must agree with a second identifier (name or file number). Anything less is uncertain:
    the caller flags the report for the doctor instead of guessing.
    """
    if date_of_birth is None:
        return PatientMatch(MatchStatus.UNCERTAIN, reasons=['missing_date_of_birth'])
    name = normalize_name(full_name)
    number = normalize_file_number(file_number)
    if not name and not number:
        return PatientMatch(MatchStatus.UNCERTAIN, reasons=['missing_second_identifier'])

    patients = Patient.objects.filter(organization=organization)
    by_number = patients.filter(file_number=number).first() if number else None
    if by_number is not None and by_number.date_of_birth != date_of_birth:
        return PatientMatch(MatchStatus.UNCERTAIN, reasons=['file_number_date_of_birth_mismatch'])

    if by_number is not None:
        if name and by_number.normalized_name != name:
            return PatientMatch(MatchStatus.UNCERTAIN, patient=by_number, reasons=['name_mismatch'])
        return PatientMatch(MatchStatus.MATCHED, patient=by_number)
    if not name:
        return PatientMatch(MatchStatus.NOT_FOUND, reasons=['unknown_file_number'])

    by_name = list(patients.filter(date_of_birth=date_of_birth, normalized_name=name)[:2])
    if len(by_name) == 1:
        if number:
            # A file number was printed but belongs to nobody: the name alone is not enough.
            return PatientMatch(MatchStatus.UNCERTAIN, patient=by_name[0], reasons=['unknown_file_number'])
        return PatientMatch(MatchStatus.MATCHED, patient=by_name[0])
    if len(by_name) > 1:
        return PatientMatch(MatchStatus.UNCERTAIN, reasons=['ambiguous'])
    if patients.filter(date_of_birth=date_of_birth).exists():
        return PatientMatch(MatchStatus.UNCERTAIN, reasons=['name_date_of_birth_mismatch'])
    return PatientMatch(MatchStatus.NOT_FOUND, reasons=['not_found'])
