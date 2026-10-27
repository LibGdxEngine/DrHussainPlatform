"""
Parser registry. Each lab that sends reports in its own layout gets a parser here, written
against that lab's real sample reports. The generic parser reads common one-result-per-line layouts;
anything it cannot read is flagged for the doctor.
"""
from typing import Callable

from .parsing import ParsedReport, parse_report


class ReportParser:
    key = ''

    def detects(self, text: str) -> bool:
        raise NotImplementedError

    def parse(self, text: str, known_test: Callable[[str], bool]) -> ParsedReport:
        raise NotImplementedError


class GenericLineParser(ReportParser):
    key = 'generic'

    def detects(self, text: str) -> bool:
        return True

    def parse(self, text, known_test):
        return parse_report(text, known_test)


# Lab-specific parsers go first; the generic one is the fallback.
PARSERS: list[ReportParser] = [GenericLineParser()]


def choose_parser(text: str) -> ReportParser:
    return next(parser for parser in PARSERS if parser.detects(text))
