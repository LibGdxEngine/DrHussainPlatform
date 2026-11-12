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
        'ml/min/1.73m2', 'ml/min/1.73m²',
    ]
}

# Words a lab prints beside a reference range ("<30 postmenopausal", "Adult female 13 - 150"). Any
# other word, or a stray number, left in the reference means the line may not have been read right.
REFERENCE_WORDS = frozenset({
    'adult', 'adults', 'female', 'females', 'male', 'males', 'women', 'men', 'woman', 'man',
    'postmenopausal', 'post-menopausal', 'premenopausal', 'pre-menopausal', 'menopausal',
    'follicular', 'luteal', 'ovulatory', 'mid-cycle', 'midcycle', 'phase', 'ref', 'reference', 'range',
})

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
_NAME_ONLY = re.compile(r'[A-Za-z][A-Za-z0-9 ,.()/+\-]*[A-Za-z0-9)]')
_NUMBER = r'[<>≤≥]?\s?\d+(?:[.,]\d+)?'
# A value ends at a space, the end of the line, or a printed flag glued to it ("5.6H", "3.1*"), so
# "TSH 3rd generation 3.1" is never read as TSH 3.
_VALUE = re.compile(
    rf'(?P<value>{_NUMBER})(?=\s|$|(?:HH|LL|H|L|\*)(?:\s|$))\s*'
    r'(?P<flag>(?:HH|LL|H|L|High|Low)(?=\s|$)|\*)?\s*(?P<rest>.*)$'
)
# A number run into letters ("45ng/mL", OCR's "4.O" or "2.l"): read, but always checked by the doctor.
_GLUED = re.compile(rf'(?P<value>{_NUMBER})(?P<tail>[^\s\d][^\s]*)\s*(?P<rest>.*)$')
# "4,500" may be four and a half or four thousand five hundred.
_THOUSANDS = re.compile(r'^[<>≤≥]?\d{1,3},\d{3}$')
_PRINTED_FLAGS = {'H', 'L', 'HH', 'LL', 'HIGH', 'LOW', '*'}
_BARE_NUMBER = re.compile(r'[<>≤≥]?\d+(?:[.,]\d+)?[*]?')
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
    # Why the reading is uncertain ('' when it is not): the doctor confirms or corrects the value.
    check_reason: str = ''
    # The report lines (whitespace collapsed) the row was read from.
    source_lines: list[str] = field(default_factory=list)


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


@dataclass
class _Reference:
    unit: str = ''
    low: Decimal | None = None
    high: Decimal | None = None
    text: str = ''
    # A flag printed after the unit ("32 ng/mL L 13 - 150").
    printed_flag: str = ''
    # Something other than the range, the unit, a flag or a reference word is left over.
    leftover: bool = False


def _parse_reference(rest: str) -> _Reference:
    """Split what follows the value into unit and reference range, and notice anything left over."""
    rest = rest.strip()
    first = rest.split()[0] if rest else ''
    ref = _Reference(unit=known_unit(first))
    if ref.unit:
        rest = rest[len(first):].strip()
    ref.text = rest.strip(' ()[]')
    remainder = rest
    if match := _RANGE.search(rest):
        ref.low, ref.high = to_decimal(match['low']), to_decimal(match['high'])
        remainder = f'{rest[:match.start()]} {rest[match.end():]}'
    elif match := _BOUND.search(rest):
        number = to_decimal(match['num'])
        if match['op'] in '<≤':
            ref.high = number
        else:
            ref.low = number
        remainder = f'{rest[:match.start()]} {rest[match.end():]}'
    if not ref.unit:
        # Some labs print the unit after the range: "13 - 150 ng/mL".
        for token in reversed(rest.split()):
            if unit := known_unit(token):
                ref.unit = unit
                ref.text = ref.text.replace(token, '').strip(' ()[]')
                remainder = remainder.replace(token, ' ')
                break
    for token in re.sub(r'[()\[\]]', ' ', remainder).split():
        token = token.strip(':;,')
        if not ref.printed_flag and token.upper() in _PRINTED_FLAGS:
            ref.printed_flag = token
        elif any(ch.isdigit() for ch in token) or (
            any(ch.isalpha() for ch in token) and token.casefold() not in REFERENCE_WORDS
        ):
            ref.leftover = True
    return ref


def row_flag(value: Decimal | None, value_text: str, printed: str, low, high) -> str:
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


def _sentence_case(text: str) -> str:
    """'DETECTED' and 'not detected' are stored as 'Detected' and 'Not detected'."""
    return text[:1].upper() + text[1:].lower()


def _splits(line: str):
    """
    Every (name, what follows) split of a line at a space, the name a plausible test name. A name
    never holds a bare number or a unit, so "Testosterone, total 0.9 nmol/L" is not a name.
    """
    for gap in re.finditer(r'\s+', line):
        name = line[:gap.start()].rstrip(':').rstrip()
        if not _NAME_ONLY.fullmatch(name):
            continue
        if any(_BARE_NUMBER.fullmatch(token) or known_unit(token) for token in name.split()):
            break
        yield name, line[gap.end():].lstrip(':').lstrip()


def _glued_tail_is_plausible(tail: str) -> bool:
    # A unit run into the number, or OCR reading a digit or decimal point as a letter.
    return bool(known_unit(tail)) or tail[0] in '.,OoIl'


def _numeric_row(line: str, known_test: Callable[[str], bool], expected_unit: Callable[[str], str]):
    # The name is the longest catalogue name the value can follow; then a catalogue name followed by a
    # glued value; with neither, the shortest name.
    candidates = [(name, match) for name, rest in _splits(line) if (match := _VALUE.match(rest))]
    known = [c for c in candidates if known_test(c[0])]
    glued = [] if known else [
        (name, match) for name, rest in _splits(line)
        if known_test(name) and (match := _GLUED.match(rest)) and _glued_tail_is_plausible(match['tail'])
    ]
    reasons = []
    if glued:
        name, match = glued[-1]
        # A glued unit is then read as the unit; anything else is left over in the reference.
        value_text, printed, rest = match['value'].replace(' ', ''), '', f"{match['tail']} {match['rest']}"
        reasons.append('value_glued')
    elif known or candidates:
        name, match = known[-1] if known else candidates[0]
        value_text, printed, rest = match['value'].replace(' ', ''), match['flag'], match['rest']
    else:
        return None
    ref = _parse_reference(rest)
    is_known = known_test(name)
    if not (is_known or ref.unit or ref.low is not None or ref.high is not None):
        return None
    if _THOUSANDS.match(value_text):
        reasons.append('ambiguous_comma')
    if ref.leftover:
        reasons.append('ref_leftover')
    if is_known and expected_unit(name) and not ref.unit:
        reasons.append('unit_missing')
    if not is_known:
        reasons.append('name_unknown')
    value = to_decimal(value_text)
    return ParsedRow(
        name=name, value_text=value_text, value_numeric=value, unit=ref.unit, ref_low=ref.low,
        ref_high=ref.high, ref_text=ref.text,
        flag=row_flag(value, value_text, printed or ref.printed_flag, ref.low, ref.high),
        check_reason=reasons[0] if reasons else '',
    )


def _unreadable_row(line: str, known_test: Callable[[str], bool]):
    """
    A known test followed by an attempted value that cannot be read ("Ferritin ?? ng/mL"): show it
    to the doctor, never guess it. Titles such as "Cervical cytology - smear" are skipped.
    """
    words = line.split()
    for size in range(min(5, len(words) - 1), 0, -1):
        name = ' '.join(words[:size]).rstrip(':')
        rest = words[size:]
        looks_like_value = any(ch.isdigit() or ch in '?#*' for ch in ''.join(rest)) or any(
            known_unit(token) for token in rest
        )
        if looks_like_value and known_test(name):
            return ParsedRow(name=name, value_text=' '.join(rest)[:255], unreadable=True)
    return None


def parse_rows(text: str, known_test: Callable[[str], bool],
               expected_unit: Callable[[str], str] = lambda name: '') -> list[ParsedRow]:
    """
    Read one result per line. A line counts as a result only when its name is a catalog test or it
    carries a recognised unit or reference range, so headers and footers are not mistaken for values.
    `expected_unit(name)` is the unit the catalogue expects for a test ('' for none); a numeric
    result printed without it is marked for checking. Any doubt about a reading sets check_reason.
    """
    lines = [' '.join(raw_line.split()) for raw_line in text.splitlines()]
    rows = []
    index = 0
    while index < len(lines):
        line, sources = lines[index], [lines[index]]
        index += 1
        if len(line) < 3:
            continue
        split = False
        name_only = line.rstrip(':').rstrip()
        if (index < len(lines) and _NAME_ONLY.fullmatch(name_only) and known_test(name_only)
                and _VALUE.match(lines[index])):
            # The test name on one line and its value on the next.
            sources.append(lines[index])
            line, split = f'{name_only} {lines[index]}', True
            index += 1
        if match := _QUALITATIVE_ROW.match(line):
            if not known_test(match['name']):
                continue
            value = _sentence_case(match['value'].strip())
            row = ParsedRow(name=match['name'], value_text=value, flag=qualitative_flag(value))
        else:
            row = _numeric_row(line, known_test, expected_unit) or _unreadable_row(line, known_test)
            if row is None:
                continue
        if split and not row.check_reason:
            row.check_reason = 'split_line'
        row.source_lines = sources
        rows.append(row)
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


def parse_report(text: str, known_test: Callable[[str], bool],
                 expected_unit: Callable[[str], str] = lambda name: '') -> ParsedReport:
    return ParsedReport(
        rows=parse_rows(text, known_test, expected_unit),
        identifiers=parse_identifiers(text),
        lab_name=parse_lab_name(text),
        collected_on=parse_collected_on(text),
    )
