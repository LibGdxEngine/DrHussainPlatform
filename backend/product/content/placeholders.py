"""
Template placeholders.

- {{name}} is filled automatically from the patient, the report or the clinic profile.
- {{prescription}} and {{follow_up}} are filled from what the doctor picks in review.
- [[anything]] is a clinical blank, such as a repeat interval or a dose, that the doctor types in
  review. A draft with an open blank cannot be sent.
"""
import re
from dataclasses import dataclass, field

from .starter import STARTER_PHRASES

AUTOMATIC = {
    'patient.first_name': "The patient's first name.",
    'patient.full_name': "The patient's full name.",
    'patient.file_number': 'The file number, e.g. VC-000142.',
    'report.date': 'The sample date on the report.',
    'report.lab': "The lab's name.",
    'results.table': 'Every result in the report, with units and ranges.',
    'results.abnormal': 'Only the results outside the reference range.',
    'comparison.table': 'Each result beside the previous one, with its date and whether it went up or down.',
    'result.name': 'In a section: the test this section is about.',
    'result.value': 'In a section: that test\'s result.',
    'clinic.name': "The clinic's name.",
    'clinic.phone': 'The number patients phone to book.',
    'doctor.name': "The doctor's name.",
    'today': "Today's date.",
    'patient.question': "In a reply: the patient's own words, without the quoted earlier email.",
    'comparison.attention': 'The current results outside the reference range, or a line saying all are within it.',
}
CHOSEN_IN_REVIEW = {
    'prescription': 'The prescription the doctor picks from the list in review.',
    'follow_up': 'The follow-up the doctor chooses in review.',
}
ALL = {**AUTOMATIC, **CHOSEN_IN_REVIEW}

# The placeholders each system phrase may use (a phrase is a short line, not a template).
PHRASE_SLOTS = {key: frozenset(slots) for key, (_, _, slots) in STARTER_PHRASES.items()}

_PLACEHOLDER = re.compile(r'\{\{\s*([^{}]*?)\s*\}\}')
_BLANK = re.compile(r'\[\[\s*([^\[\]]*?)\s*\]\]')


def placeholder_names(text: str) -> set[str]:
    return set(_PLACEHOLDER.findall(text or ''))


def allowed_placeholders(key: str):
    """What a template or phrase with this key may use."""
    return PHRASE_SLOTS.get(key, frozenset()) if key.startswith('phrase.') else ALL


def validate_text(text: str, allowed=None) -> list[str]:
    """Problems that would stop a template (or, with `allowed`, a phrase) being saved."""
    allowed = ALL if allowed is None else allowed
    errors = []
    unknown = sorted({name for name in _PLACEHOLDER.findall(text) if name not in allowed})
    if unknown:
        errors.append('Unknown placeholder: ' + ', '.join(f'{{{{{n}}}}}' for n in unknown) + '.')
    stripped = _BLANK.sub('', _PLACEHOLDER.sub('', text))
    if '{{' in stripped or '}}' in stripped:
        errors.append('A {{placeholder}} is not closed.')
    if '[[' in stripped or ']]' in stripped:
        errors.append('A [[blank]] is not closed.')
    if any(not label for label in _BLANK.findall(text)):
        errors.append('A [[blank]] needs a label, e.g. [[repeat interval]].')
    return errors


@dataclass
class Rendered:
    text: str
    # Labels the doctor still has to fill: [[blanks]] and placeholders with no value yet.
    open_slots: list[str] = field(default_factory=list)


def render(text: str, values: dict[str, str]) -> Rendered:
    """Fill placeholders that have a value; anything without one becomes a [[blank]] for the doctor."""
    open_slots = []

    def fill(match):
        name = match.group(1)
        value = values.get(name)
        if value:
            return value
        label = name if name in CHOSEN_IN_REVIEW else f'{name} (not available)'
        open_slots.append(label)
        return f'[[{label}]]'

    text = _PLACEHOLDER.sub(fill, text)
    open_slots = list(dict.fromkeys([*open_slots, *_BLANK.findall(text)]))
    return Rendered(text, open_slots)


SAMPLE_VALUES = {
    'patient.first_name': 'Laila',
    'patient.full_name': 'Laila Ahmed (sample)',
    'patient.file_number': 'VC-000000',
    'report.date': '3 Oct 2026',
    'report.lab': 'Sample Laboratory',
    'results.table': 'Ferritin: 32 ng/mL (13–150)\nTSH: 1.8 mIU/L (0.4–4.0)',
    'results.abnormal': 'Ferritin: 32 ng/mL (low for the clinic target of 50–150)',
    'comparison.table': 'Ferritin: 21 ng/mL on 3 Jul 2026 → 32 ng/mL on 3 Oct 2026 (up)',
    'comparison.attention': 'Ferritin: 32 ng/mL (low)',
    'result.name': 'Chlamydia trachomatis',
    'result.value': 'Detected',
    'today': '25 Oct 2026',
}
