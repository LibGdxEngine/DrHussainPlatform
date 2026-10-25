"""Decide what kind of report this is; the type picks the results email template."""
import re
from dataclasses import dataclass, field

from product.results.models import ReportType

SMEAR_TERMS = ('cervical cytology', 'cervical smear', 'pap smear', 'pap test', 'papanicolaou',
               'liquid based cytology', 'liquid-based cytology', 'thinprep', 'surepath', 'bethesda')
SMEAR_NORMAL_TERMS = ('negative for intraepithelial lesion', 'nilm', 'no abnormal cells', 'no dyskaryosis')
# Any of these makes a smear abnormal. Matched as words so "negative for intraepithelial lesion"
# never counts as a lesion.
SMEAR_ABNORMAL_TERMS = ('asc-us', 'ascus', 'asc-h', 'lsil', 'hsil', 'agc', 'ais', 'atypical squamous',
                        'atypical glandular', 'low grade squamous intraepithelial',
                        'low-grade squamous intraepithelial', 'high grade squamous intraepithelial',
                        'high-grade squamous intraepithelial', 'dyskaryosis', 'squamous cell carcinoma',
                        'adenocarcinoma', 'cin 1', 'cin 2', 'cin 3', 'cin1', 'cin2', 'cin3')
PATHOLOGY_TERMS = ('histopathology', 'histology report', 'surgical pathology', 'biopsy', 'macroscopic description',
                   'microscopic description', 'gross description', 'specimen received')
INFECTION_TERMS = ('high vaginal swab', 'endocervical swab', 'culture and sensitivity', 'sti screen',
                   'sexually transmitted', 'urethral swab', 'vaginal swab')
INFECTION_TESTS = {'chlamydia', 'gonorrhoea', 'trichomonas', 'mycoplasma_genitalium', 'ureaplasma', 'candida',
                   'bacterial_vaginosis', 'group_b_strep', 'hpv_high_risk', 'herpes', 'syphilis', 'hiv'}
MENOPAUSE_TESTS = {'fsh', 'lh', 'estradiol', 'amh'}


@dataclass
class Classification:
    report_type: str
    flags: list[str] = field(default_factory=list)
    smear_finding: str = ''


def _has(text: str, terms) -> list[str]:
    return [t for t in terms if re.search(rf'(?<![a-z]){re.escape(t)}(?![a-z])', text)]


def classify(text: str, test_codes: set[str], has_numeric: bool, positive_codes: set[str] = frozenset()) -> Classification:
    """
    `positive_codes` are tests with a detected / abnormal result. A blood panel that also lists a
    negative swab stays a blood report; any positive infection makes it an infection report.
    """
    lowered = text.casefold()
    if _has(lowered, SMEAR_TERMS):
        abnormal = _has(lowered, SMEAR_ABNORMAL_TERMS)
        if abnormal:
            return Classification(ReportType.SMEAR_ABNORMAL, smear_finding=abnormal[0].upper())
        if _has(lowered, SMEAR_NORMAL_TERMS):
            return Classification(ReportType.SMEAR_NORMAL, smear_finding='NILM')
        # A smear we cannot read is handled like an abnormal one: the doctor sees it, no draft.
        return Classification(ReportType.SMEAR_ABNORMAL, flags=['smear_result_unclear'])
    if _has(lowered, PATHOLOGY_TERMS):
        return Classification(ReportType.PATHOLOGY)
    infection_tests = test_codes & INFECTION_TESTS
    blood_tests = test_codes - INFECTION_TESTS
    if positive_codes & INFECTION_TESTS:
        return Classification(ReportType.INFECTION)
    if (infection_tests or _has(lowered, INFECTION_TERMS)) and not (has_numeric and blood_tests):
        return Classification(ReportType.INFECTION)
    if test_codes & MENOPAUSE_TESTS:
        return Classification(ReportType.MENOPAUSE_BLOODS)
    if has_numeric:
        return Classification(ReportType.BLOODS)
    return Classification(ReportType.UNKNOWN, flags=['unknown_report_type'])
