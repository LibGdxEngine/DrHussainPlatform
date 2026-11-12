"""
Suggested translations for the review screen's side-by-side translation boxes.

A suggestion only pre-fills the box: a person reads, corrects and saves the wording, and nothing is
sent until the doctor approves the draft. Patient data stays on the clinic server, so a translator
must run locally with no network access (no outside translation or AI service). Set
`settings.EMR_TRANSLATOR` to the dotted path of a class implementing `Translator` to plug one in;
the default is `NullTranslator`, which suggests nothing.
"""
from typing import Protocol

from django.conf import settings
from django.utils.module_loading import import_string


class Translator(Protocol):
    def suggest(self, text: str, *, source: str, target: str) -> str | None:
        """A suggested translation of `text`, keeping every {{placeholder}} as it is, or None."""


class NullTranslator:
    def suggest(self, text: str, *, source: str, target: str) -> str | None:
        return None


def get_translator() -> Translator:
    path = getattr(settings, 'EMR_TRANSLATOR', '')
    return import_string(path)() if path else NullTranslator()
