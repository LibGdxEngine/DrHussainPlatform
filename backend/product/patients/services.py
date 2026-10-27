import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q

from .models import FileNumberSequence, Patient

FILE_NUMBER_PREFIX = 'VC-'
_HONORIFICS = {'mrs', 'mr', 'ms', 'miss', 'dr', 'madam', 'د', 'الدكتور', 'الدكتورة'}
# Arabic spellings that vary from one writer to the next: hamza forms, taa marbuta, alef maqsura.
_ARABIC_FOLD = str.maketrans({
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',  # hamza/wasla alef -> alef
    'ة': 'ه',  # taa marbuta -> haa
    'ى': 'ي',  # alef maqsura -> yaa
    'ؤ': 'و',  # hamza on waw -> waw
    'ئ': 'ي',  # hamza on yaa -> yaa
    'ـ': None,  # tatweel
})
_ARABIC_MARKS = re.compile('[ً-ٰٟ]')  # tashkeel
# Searching by date of birth also shows people born within this many days of it (a day/month slip, a year off).
DOB_WINDOW_DAYS = 366


def normalize_name(name: str) -> str:
    """
    Casefold, drop punctuation and titles, collapse spaces, and fold Arabic letter variants:
    'Mrs. Laila  AHMED' -> 'laila ahmed', 'أحمد علىّ' -> 'احمد علي'.
    """
    text = unicodedata.normalize('NFKC', name or '').casefold()
    text = _ARABIC_MARKS.sub('', text).translate(_ARABIC_FOLD)
    words = re.sub(r'[^\w\s]', ' ', text).split()
    return ' '.join(w for w in words if w not in _HONORIFICS)


def _name_query(normalized: str, *, exact: bool) -> Q:
    """Match either the English or the Arabic name of a file."""
    lookup = '' if exact else '__contains'
    return Q(**{f'normalized_name{lookup}': normalized}) | Q(**{f'normalized_name_ar{lookup}': normalized})


def search_patients(queryset, *, query: str = '', date_of_birth: date | None = None):
    """
    Staff search. The name is matched in English or Arabic; a date of birth narrows the list to people
    born on or near that day, nearest first, so a slip in the day, month or year still finds the file.
    Returns a queryset, or an ordered list when a date of birth was given.
    """
    query = (query or '').strip()
    if query:
        name = normalize_name(query)
        condition = Q(file_number__icontains=query) | Q(mobile__icontains=query) | Q(whatsapp__icontains=query) | Q(email__icontains=query)
        if name:
            condition |= _name_query(name, exact=False)
        queryset = queryset.filter(condition)
    if date_of_birth is None:
        return queryset
    window = timedelta(days=DOB_WINDOW_DAYS)
    nearby = queryset.filter(date_of_birth__range=(date_of_birth - window, date_of_birth + window))
    return sorted(nearby, key=lambda p: (abs((p.date_of_birth - date_of_birth).days), p.full_name, p.file_number))


def normalize_file_number(value: str) -> str:
    return (value or '').strip().upper()


def next_file_number(organization) -> str:
    """Issue the clinic's next file number; call inside a transaction."""
    sequence, _ = FileNumberSequence.objects.select_for_update().get_or_create(organization=organization)
    sequence.last_value += 1
    sequence.save(update_fields=['last_value'])
    return f'{FILE_NUMBER_PREFIX}{sequence.last_value:06d}'


def find_similar(organization, full_name: str, date_of_birth: date, full_name_ar: str = ''):
    """Existing files with the same name (English or Arabic) and date of birth, shown before a duplicate is created."""
    names = Q()
    for name in {normalize_name(full_name), normalize_name(full_name_ar)} - {''}:
        names |= _name_query(name, exact=True)
    if not names:
        return Patient.objects.none()
    return Patient.objects.filter(names, organization=organization, date_of_birth=date_of_birth)


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
        if name and name not in (by_number.normalized_name, by_number.normalized_name_ar):
            return PatientMatch(MatchStatus.UNCERTAIN, patient=by_number, reasons=['name_mismatch'])
        return PatientMatch(MatchStatus.MATCHED, patient=by_number)
    if not name:
        return PatientMatch(MatchStatus.NOT_FOUND, reasons=['unknown_file_number'])

    by_name = list(patients.filter(_name_query(name, exact=True), date_of_birth=date_of_birth)[:2])
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
