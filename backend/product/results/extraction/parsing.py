"""Read result rows, patient identifiers and dates out of report text."""
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Callable

KNOWN_UNITS = {
    unit.casefold() for unit in [
        '%', 'g/dl', 'g/l', 'mg/dl', 'mg/l', 'mmol/l', 'umol/l', 'µmol/l', 'μmol/l', 'nmol/l', 'pmol/l',
        'ng/ml', 'ng/dl', 'pg/ml', 'ug/dl', 'µg/dl', 'ug/l', 'µg/l', 'miu/ml', 'miu/l', 'uiu/ml', 'µiu/ml',
        'μiu/ml', 'iu/l', 'iu/ml', 'u/l', 'u/ml', 'x10^9/l', 'x10^12/l', '10^9/l', '10^12/l', '10^3/ul',
        '10^6/ul', 'x10³/µl', 'fl', 'pg', 'mm/hr', 'mm/h', 'sec', 'ratio', 'cells/ul', 'mmol/mol',
    ]
}

# OCR reads a capital I as a lower-case l: "mlU/L" is mIU/L.
OCR_UNIT_FIXES = {'mlu/l': 'mIU/L', 'mlu/ml': 'mIU/mL', 'ulu/ml': 'uIU/mL', 'µlu/ml': 'µIU/mL', 'lu/l': 'IU/L'}


def known_unit(token: str) -> str:
    """The unit written as `token`, or '' when it is not a unit."""
    cleaned = token.strip('()')
    folded = cleaned.casefold()
    if folded in OCR_UNIT_FIXES:
        return OCR_UNIT_FIXES[folded]
    return cleaned if folded in KNOWN_UNITS else ''


POSITIVE_WORDS = ('detected', 'positive', 'present', 'isolated', 'reactive', 'seen', 'growth of')
NEGATIVE_WORDS = ('not detected', 'negative', 'absent', 'not isolated', 'non-reactive', 'non reactive',
                  'nonreactive', 'not seen', 'no growth')
_QUALITATIVE = '|'.join(re.escape(w) for w in sorted(NEGATIVE_WORDS + POSITIVE_WORDS, key=len, reverse=True))

_NAME = r'(?P<name>[A-Za-z][A-Za-z0-9 ,.()/+\-]*?[A-Za-z0-9)])'
_NUMBER = r'[<>≤≥]?\s?\d+(?:[.,]\d+)?'
_NUMERIC_ROW = re.compile(
    rf'^{_NAME}\s*:?\s+(?P<value>{_NUMBER})\s*(?P<flag>\b(?:HH|LL|H|L|High|Low)\b|\*)?\s*'
    r'(?P<rest>.*)$'
)
_QUALITATIVE_ROW = re.compile(rf'^{_NAME}\s*:?\s+(?P<value>{_QUALITATIVE})\b(?P<rest>.*)$', re.IGNORECASE)
_RANGE = re.compile(rf'\(?\s*(?P<low>\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(?P<high>\d+(?:[.,]\d+)?)\s*\)?')
_BOUND = re.compile(r'\(?\s*(?P<op>[<>≤≥])\s*(?P<num>\d+(?:[.,]\d+)?)\s*\)?')

_MONTHS = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], start=1)}
_DATE = r'(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]+\d{2,4})'


@dataclass
class ParsedRow:
    name: str
    value_text: str = ''
    value_numeric: Decimal | None = None
    unit: str = ''
    ref_low: Decimal | None = None
    ref_high: Decimal | None = None
    ref_text: str = ''
    flag: str = ''
    unreadable: bool = False


@dataclass
class ParsedReport:
    rows: list[ParsedRow] = field(default_factory=list)
    identifiers: dict = field(default_factory=dict)
    lab_name: str = ''
    collected_on: date | None = None


def to_decimal(text: str) -> Decimal | None:
    try:
        return Decimal(text.replace(',', '.').strip(' <>≤≥'))
    except (InvalidOperation, AttributeError):
        return None


def parse_date(text: str | None) -> date | None:
    """Parse the date formats seen on reports. Slashed dates are day first, as written in Egypt."""
    if not text:
        return None
    text = text.strip().rstrip('.,')
    match = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', text)
    if match:
        parts = (int(match[1]), int(match[2]), int(match[3]))
    elif match := re.match(r'^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})', text):
        parts = (int(match[3]), int(match[2]), int(match[1]))
    elif match := re.match(r'^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2,4})', text):
        month = _MONTHS.get(match[2][:3].casefold())
        if month is None:
            return None
        parts = (int(match[3]), month, int(match[1]))
    else:
        return None
    year, month, day = parts
    if year < 100:
        year += 2000 if year <= datetime.now().year % 100 else 1900
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _parse_reference(rest: str) -> tuple[str, Decimal | None, Decimal | None, str]:
    """Split what follows the value into unit and reference range."""
    rest = rest.strip()
    first = rest.split()[0] if rest else ''
    unit = known_unit(first)
    if unit:
        rest = rest[len(first):].strip()
    ref_text = rest.strip(' ()[]')
    low = high = None
    if match := _RANGE.search(rest):
        low, high = to_decimal(match['low']), to_decimal(match['high'])
    elif match := _BOUND.search(rest):
        number = to_decimal(match['num'])
        if match['op'] in '<≤':
            high = number
        else:
            low = number
    if not unit:
        # Some labs print the unit after the range: "13 - 150 ng/mL".
        for token in reversed(rest.split()):
            if unit := known_unit(token):
                ref_text = ref_text.replace(token, '').strip(' ()[]')
                break
    return unit, low, high, ref_text


def _row_flag(value: Decimal | None, value_text: str, printed: str, low, high) -> str:
    printed = (printed or '').strip().upper()
    if printed in {'H', 'HH', 'HIGH'}:
        return 'H'
    if printed in {'L', 'LL', 'LOW'}:
        return 'L'
    if printed == '*':
        return 'A'
    if value is None or value_text[:1] in '<>≤≥':
        return ''
    if low is not None and value < low:
        return 'L'
    if high is not None and value > high:
        return 'H'
    return 'N' if (low is not None or high is not None) else ''


def qualitative_flag(value_text: str) -> str:
    text = value_text.casefold()
    if any(text.startswith(word) for word in NEGATIVE_WORDS):
        return 'N'
    return 'A' if any(text.startswith(word) for word in POSITIVE_WORDS) else ''


def parse_rows(text: str, known_test: Callable[[str], bool]) -> list[ParsedRow]:
    """
    Read one result per line. A line counts as a result only when its name is a catalog test or it
    carries a recognised unit or reference range, so headers and footers are not mistaken for values.
    """
    rows = []
    for raw_line in text.splitlines():
        line = ' '.join(raw_line.split())
        if len(line) < 3:
            continue
        if match := _QUALITATIVE_ROW.match(line):
            if known_test(match['name']):
                value = match['value'].strip()
                rows.append(ParsedRow(name=match['name'], value_text=value, flag=qualitative_flag(value)))
            continue
        if match := _NUMERIC_ROW.match(line):
            name, value_text = match['name'].strip(), match['value'].replace(' ', '')
            unit, low, high, ref_text = _parse_reference(match['rest'])
            if not (known_test(name) or unit or low is not None or high is not None):
                continue
            value = to_decimal(value_text)
            rows.append(ParsedRow(
                name=name, value_text=value_text, value_numeric=value, unit=unit, ref_low=low, ref_high=high,
                ref_text=ref_text, flag=_row_flag(value, value_text, match['flag'], low, high),
            ))
            continue
        # A known test followed by an attempted value that cannot be read ("Ferritin ?? ng/mL"):
        # show it to the doctor, never guess it. Titles such as "Cervical cytology - smear" are skipped.
        words = line.split()
        for size in range(min(5, len(words) - 1), 0, -1):
            name = ' '.join(words[:size]).rstrip(':')
            rest = words[size:]
            looks_like_value = any(ch.isdigit() or ch in '?#*' for ch in ''.join(rest)) or any(
                known_unit(token) for token in rest
            )
            if looks_like_value and known_test(name):
                rows.append(ParsedRow(name=name, value_text=' '.join(rest)[:255], unreadable=True))
                break
    return rows


_IDENTIFIER_PATTERNS = {
    'name': re.compile(
        r'(?:patient\s*name|patient|name)\s*[:\-]\s*(?P<v>[^\n:]+?)'
        r'(?=\s{2,}|\s+(?:age|sex|gender|d\.?o\.?b|date of birth|file|mrn|id|ref|lab)\b|$)',
        re.IGNORECASE | re.MULTILINE),
    'date_of_birth': re.compile(rf'(?:d\.?o\.?b\.?|date\s+of\s+birth|birth\s*date)\s*[:\-]?\s*(?P<v>{_DATE})',
                                re.IGNORECASE),
    'file_number': re.compile(
        r'(?:file\s*(?:no|number|#)|mrn|clinic\s*(?:no|ref|file))\.?\s*[:\-#]?\s*(?P<v>[A-Z]{1,4}-?\d{3,})',
        re.IGNORECASE),
}
_COLLECTED = re.compile(
    rf'(?:collected(?:\s+on)?|collection\s+date|sample\s+date|specimen\s+date|date\s+collected|sampling\s+date)'
    rf'\s*[:\-]?\s*(?P<v>{_DATE})', re.IGNORECASE)
_REPORTED = re.compile(rf'(?:reported(?:\s+on)?|report\s+date|received(?:\s+on)?|date)\s*[:\-]?\s*(?P<v>{_DATE})',
                       re.IGNORECASE)
_LAB_LINE = re.compile(r'\b(?:laborator(?:y|ies)|labs?|diagnostics?|pathology|medical\s+centre|medical\s+center)\b',
                       re.IGNORECASE)


_NOT_PATIENT = re.compile(r'(?:lab(?:oratory)?|doctor|dr\.?|physician|referr\w*|consultant|test)\s*$', re.IGNORECASE)


def parse_identifiers(text: str) -> dict:
    found = {}
    for key, pattern in _IDENTIFIER_PATTERNS.items():
        for match in pattern.finditer(text):
            # "Doctor name:" or "Lab name:" on the same line is not the patient.
            line_start = text.rfind('\n', 0, match.start()) + 1
            if key == 'name' and _NOT_PATIENT.search(text[max(line_start, match.start() - 20):match.start()]):
                continue
            found[key] = ' '.join(match['v'].split())
            break
    if 'date_of_birth' in found:
        parsed = parse_date(found['date_of_birth'])
        found['date_of_birth'] = parsed.isoformat() if parsed else ''
    if found.get('file_number'):
        found['file_number'] = found['file_number'].upper()
    return {k: v for k, v in found.items() if v}


def parse_collected_on(text: str) -> date | None:
    match = _COLLECTED.search(text) or _REPORTED.search(text)
    return parse_date(match['v']) if match else None


def parse_lab_name(text: str) -> str:
    for line in text.splitlines()[:8]:
        line = ' '.join(line.split())
        if line and _LAB_LINE.search(line) and len(line) <= 80:
            return line
    return ''


def parse_report(text: str, known_test: Callable[[str], bool]) -> ParsedReport:
    return ParsedReport(
        rows=parse_rows(text, known_test),
        identifiers=parse_identifiers(text),
        lab_name=parse_lab_name(text),
        collected_on=parse_collected_on(text),
    )
