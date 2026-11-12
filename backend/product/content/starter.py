"""
Starter content loaded the first time a clinic opens its settings. After that the clinic owns it:
nothing here overwrites an edit.

Template wording is NOT clinical content from this file. Each template slot starts as an unapproved
placeholder pointing at the clinic's master copy; drafts are only built from approved versions.
"""
from django.db import transaction
from django.utils import timezone

from apps.organizations.models import Organization

from product.results.catalog import DEFAULT_TESTS
from product.results.extraction.classify import INFECTION_TESTS

from .models import (
    AlertRule, AlertRuleVersion, EmailTemplate, EmailTemplateVersion, ScoreBandSet, ScoreBandVersion, TemplateKind,
    TemplatePart,
)

# R1-R40 from the forms doc, section 13 ("Alert rules: the exact list to build"), as in the mock-up.
# code, field, pre, threshold_a, mid, threshold_b, post, level, message
STARTER_ALERT_RULES = [
    ("R1", "Breast cancer (6a)", "= Yes", None, "", None, "", "red", "Avoid systemic HRT and combined pill"),
    ("R2", "Coronary disease, MI or angina (6a)", "= Yes", None, "", None, "", "red", "Avoid systemic HRT"),
    ("R3", "Stroke or TIA (6a)", "= Yes", None, "", None, "", "red", "Avoid systemic HRT and combined pill"),
    ("R4", "DVT or PE (6a)", "= Yes", None, "", None, "", "red", "Avoid systemic HRT and combined pill"),
    ("R5", "Active liver disease (6a)", "= Yes", None, "", None, "", "red", "Avoid systemic HRT"),
    ("R6", "Current unexplained bleeding (6a)", "= Yes", None, "", None, "", "red", "Investigate before prescribing"),
    ("R7", "Bleeding since last period (3)", "= Yes", None, "", None, "", "red", "Postmenopausal bleeding: exam and TVUS"),
    ("R8", "Postcoital or intermenstrual bleeding (3)", "= Yes", None, "", None, "", "red", "Exam, smear status, TVUS"),
    ("R9", "Bleeding on continuous combined HRT (12)", "after", "6", "months", None, "", "red", "Investigate before changing regimen"),
    ("R10", "Uterus present + prescription", "systemic estrogen without progestogen", None, "", None, "", "red", "Blocks prescription: add endometrial protection"),
    ("R11", "Peanut allergy + prescription", "Prometrium prescribed", None, "", None, "", "red", "Blocks prescription: contains peanut oil"),
    ("R12", "Possible pregnancy (5 / 10b)", "yes or unsure, with pain or bleeding", None, "", None, "", "red", "Rule out ectopic: β-hCG today"),
    ("R13", "Pelvic pain (10b)", "pain + fever", None, "", None, "", "red", "Possible PID"),
    ("R14", "Breast concern (10b)", "new lump, bloody discharge or skin change", None, "", None, "", "red", "Urgent breast referral"),
    ("R15", "Self-harm question (6d)", "any answer other than 'Not at all'", None, "", None, "", "red", "Same-day review"),
    ("R16", "Age or time since last period (2, 3)", "age ≥", "60", "or >", "10", "years", "amber", "Weigh HRT benefit and risk; use transdermal"),
    ("R17", "Age at menopause (3)", "<", "45", "early; <", "40", "POI", "amber", "HRT until about 51 unless contraindicated"),
    ("R18", "Migraine (6b)", "with aura", None, "", None, "", "amber", "Transdermal only; no combined pill"),
    ("R19", "Smoking (6b)", "current; no combined pill if age ≥", "35", "", None, "", "amber", "Transdermal; no combined pill if ≥35"),
    ("R20", "Blood pressure, average (11)", "≥", "140", "/", "90", "", "amber", "Recheck; treat before HRT or combined pill"),
    ("R21", "BMI (11)", "≥", "30", "", None, "", "amber", "Transdermal; cardiovascular and breast risk"),
    ("R22", "Waist (11)", ">", "88", "cm", None, "", "amber", "Metabolic risk: insulin, HbA1c and lipids"),
    ("R23", "Alcohol (9)", "≥", "14", "units/week", None, "", "amber", "Counsel on breast and heart risk"),
    ("R24", "Family history of breast cancer (8)", "diagnosed before", "50", "or ≥", "2", "relatives", "amber", "Breast risk / genetics assessment"),
    ("R25", "Family history of ovarian cancer or BRCA (8)", "any / yes", None, "", None, "", "amber", "Genetics referral"),
    ("R26", "Family history of VTE (8)", "first-degree relative", None, "", None, "", "amber", "Transdermal only; consider thrombophilia screen"),
    ("R27", "Family history of premature heart disease (8)", "men <", "55", ", women <", "65", "", "amber", "Order Lp(a) if never done"),
    ("R28", "Pregnancy complications (5)", "preeclampsia, gestational diabetes or preterm birth", None, "", None, "", "amber", "Cardiovascular risk factor: lipids and BP"),
    ("R29", "PHQ-2 or GAD-2 (6d)", "score ≥", "3", "", None, "", "amber", "Complete PHQ-9 or GAD-7"),
    ("R30", "MRS item 2, heart discomfort (4)", "≥", "3", "", None, "", "amber", "Assess before attributing (ECG ± Holter)"),
    ("R31", "Distressing low desire (10)", "\"A lot\"", None, "", None, "", "amber", "HSDD assessment"),
    ("R32", "St John's Wort (7)", "listed", None, "", None, "", "amber", "Check interactions"),
    ("R33", "UTIs per year (10b)", "≥", "2", "and postmenopausal", None, "", "amber", "Offer vaginal estrogen"),
    ("R34", "Total testosterone (labs)", ">", "50", "ng/dL on treatment", None, "", "amber", "Above female range: reduce dose"),
    ("R35", "Testosterone therapy (12)", "no benefit after", "6", "months", None, "", "amber", "Consider stopping"),
    ("R36", "Mammogram date (5)", "older than", "[set]", "months", None, "", "reminder", "Screening overdue"),
    ("R37", "Cervical smear date (5)", "older than", "[set]", "months", None, "", "reminder", "Screening overdue"),
    ("R38", "LNG-IUS insertion date (5)", "≥", "5", "years", None, "", "reminder", "Replace for HRT protection"),
    ("R39", "Lp(a) (labs)", "never measured", None, "", None, "", "reminder", "Order once in a lifetime"),
    ("R40", "Last annual review (12)", ">", "12", "months", None, "", "reminder", "Annual benefit/risk review"),
]

# The emails the doctor edits most, pinned to the home page for a new clinic.
STARTER_PINNED = ('results', 'menopause_results', 'follow_up_comparison', 'sti_opening', 'smear_section_1',
                  'prescription_reply')

# The starter rules that are about lab values, and how each is checked against results.
STARTER_LAB_CHECKS = {
    'R34': ('testosterone_total', 'gt'),
    'R39': ('lpa', 'never_measured'),
}

# The starter rules about examination vitals, and how each is compared with the latest examination.
STARTER_VITAL_CHECKS = {
    'R20': ('blood_pressure', 'gte'),
    'R21': ('bmi', 'gte'),
    'R22': ('waist', 'gt'),
}

# The starter rules checked against the patient's form answers: rule code -> answer check code
# (content/answer_checks.py). The forms doc's rule-input table says which answers each one reads.
STARTER_ANSWER_CHECKS = {
    'R1': 'breast_cancer', 'R2': 'coronary_disease', 'R3': 'stroke_tia', 'R4': 'vte', 'R5': 'liver_disease',
    'R6': 'unexplained_bleeding', 'R7': 'bleeding_after_year', 'R8': 'intermenstrual_bleeding',
    'R11': 'peanut_allergy_progesterone', 'R12': 'pregnancy_pain_bleeding', 'R13': 'pelvic_pain_fever',
    'R14': 'breast_concern', 'R15': 'self_harm', 'R16': 'age_or_years_since_period', 'R17': 'menopause_age',
    'R18': 'migraine_aura', 'R19': 'smoking', 'R23': 'alcohol_units', 'R24': 'fh_breast_cancer',
    'R25': 'fh_ovarian_brca', 'R26': 'fh_vte', 'R27': 'fh_premature_cvd', 'R28': 'pregnancy_complications',
    'R29': 'phq2_gad2', 'R30': 'mrs_heart', 'R31': 'desire_bother', 'R32': 'medicine_listed',
    'R33': 'utis_per_year', 'R36': 'mammogram_date', 'R37': 'smear_date', 'R38': 'lng_ius_date',
}

# Medicine names a rule needs among the patient's current medicines (matched normalised, as substrings).
STARTER_MEDICINE_TERMS = {
    'R11': ['prometrium', 'micronised progesterone', 'micronized progesterone'],
    'R32': ["st john's wort", 'st johns wort', 'hypericum'],
    'R34': ['testosterone'],
}

# System phrases: the short English lines the drafting code inserts, moved out of the code so the
# clinic can reword and translate them. key -> (name, English text, allowed placeholders).
# Text None: no English version is loaded; phrase.signature falls back to the clinic profile's
# signature until the clinic approves one. Arabic versions are never created here.
STARTER_PHRASES = {
    'phrase.could_not_be_read': ('Result could not be read', 'could not be read', ()),
    'phrase.flag_high': ('Result flag: high', 'high', ()),
    'phrase.flag_low': ('Result flag: low', 'low', ()),
    'phrase.flag_abnormal': ('Result flag: abnormal', 'abnormal', ()),
    'phrase.reference': ('Reference range', 'reference {{range}}', ('range',)),
    'phrase.change_higher': ('Change: higher', 'higher', ()),
    'phrase.change_lower': ('Change: lower', 'lower', ()),
    'phrase.change_unchanged': ('Change: unchanged', 'unchanged', ()),
    'phrase.change_changed': ('Change: changed', 'changed', ()),
    'phrase.not_compared': ('Not compared', 'measured differently, not compared', ()),
    'phrase.all_within_range': ('All results within range', 'All results are within the reference range.', ()),
    'phrase.above_range': ('Range: above', 'above the reference range', ()),
    'phrase.below_range': ('Range: below', 'below the reference range', ()),
    'phrase.back_within_range': ('Range: back within', 'back within the reference range', ()),
    'phrase.toward_range': ('Range: closer', 'closer to the reference range', ()),
    'phrase.further_from_range': ('Range: further', 'further from the reference range', ()),
    'phrase.different_lab': ('Different lab', 'different lab: {{labs}}', ('labs',)),
    'phrase.follow_up_heading': ('Follow-up heading', 'Follow-up: {{follow_up}}', ('follow_up',)),
    'phrase.default_subject': ('Default subject', 'Your results', ()),
    'phrase.signature': ('Signature', None, ()),
}
# The phrases whose text is the English that was hard-coded in review/services.py.
MOVED_PHRASES = {
    'phrase.could_not_be_read', 'phrase.flag_high', 'phrase.flag_low', 'phrase.flag_abnormal', 'phrase.reference',
    'phrase.change_higher', 'phrase.change_lower', 'phrase.change_unchanged', 'phrase.change_changed',
    'phrase.not_compared', 'phrase.all_within_range', 'phrase.default_subject',
}

# MRS total score bands, forms doc section 4.
STARTER_MRS_BANDS = [{'label': 'Mild', 'min': 5}, {'label': 'Moderate', 'min': 9}, {'label': 'Severe', 'min': 16}]

_TEST_NAMES = {code: name for code, name, *_ in DEFAULT_TESTS}


def _placeholder(what: str) -> str:
    return f'Dear {{{{patient.first_name}}}},\n\n[[Paste the approved wording for: {what}]]\n'


def starter_templates() -> list[dict]:
    """The template slots the spec's routing table needs, in English."""
    templates = [
        dict(key='results', name='Results email', kind=TemplateKind.RESULTS,
             subject='Your test results', what='the results email (first results)'),
        dict(key='menopause_results', name='Menopause / perimenopause results', kind=TemplateKind.MENOPAUSE,
             subject='Your blood test results', what='the menopause results email, inviting the patient to phone to book'),
        dict(key='follow_up_comparison', name='Follow-up comparison', kind=TemplateKind.FOLLOW_UP,
             subject='Your follow-up results', what='the follow-up comparison email'),
        dict(key='pathology_results', name='Pathology results', kind=TemplateKind.PATHOLOGY,
             subject='Your pathology results', what='the pathology results email'),
        dict(key='sti_opening', name='STI and infection results: opening', kind=TemplateKind.INFECTION,
             part=TemplatePart.OPENING, subject='Your swab results', what='the opening of the STI results email'),
        dict(key='sti_closing', name='STI and infection results: closing', kind=TemplateKind.INFECTION,
             part=TemplatePart.CLOSING, what='the closing of the STI results email', sort_order=999),
        dict(key='prescription_reply', name='Reply about a prescription', kind=TemplateKind.REPLY,
             subject='Re: your prescription', what='the answer to a question about a prescription'),
    ]
    for position, code in enumerate(sorted(INFECTION_TESTS), start=1):
        templates.append(dict(
            key=f'sti_section_{code}', name=f'STI section: {_TEST_NAMES.get(code, code)} positive',
            kind=TemplateKind.INFECTION, part=TemplatePart.SECTION, section_key=code, sort_order=position * 10,
            what=f'the section for a positive {_TEST_NAMES.get(code, code)} result',
        ))
    templates.append(dict(
        key='smear_section_1', name='Cervical smear email, section 1: normal', kind=TemplateKind.SMEAR,
        part=TemplatePart.SECTION, section_key='smear_1', sort_order=10, subject='Your smear result',
        what='cervical smear emails, section 1 (normal, repeat in 3 to 5 years)',
    ))
    for number in range(2, 15):
        templates.append(dict(
            key=f'smear_section_{number}', name=f'Cervical smear email, section {number}', kind=TemplateKind.SMEAR,
            part=TemplatePart.SECTION, section_key=f'smear_{number}', sort_order=number * 10,
            subject='Your smear result', what=f'cervical smear emails, section {number}',
        ))
    return templates


def _has_starter_content(organization) -> bool:
    templates = EmailTemplate.objects.filter(organization=organization)
    return (
        AlertRule.objects.filter(organization=organization).exists()
        and ScoreBandSet.objects.filter(organization=organization, code='mrs').exists()
        and templates.exclude(kind=TemplateKind.PHRASE).exists()
        and templates.filter(kind=TemplateKind.PHRASE).exists()
    )


def ensure_starter_content(organization) -> None:
    if _has_starter_content(organization):
        return
    with transaction.atomic():
        # Screens load several lists at once; lock the clinic so only one request seeds it.
        Organization.objects.select_for_update().get(pk=organization.pk)
        _load_starter_content(organization)


def _load_starter_content(organization) -> None:
    if not AlertRule.objects.filter(organization=organization).exists():
        for position, (code, field, pre, a, mid, b, post, level, message) in enumerate(STARTER_ALERT_RULES):
            rule = AlertRule.objects.create(organization=organization, code=code, sort_order=position)
            test_code, check = STARTER_LAB_CHECKS.get(code, ('', ''))
            vital, check = STARTER_VITAL_CHECKS.get(code, ('', check))
            AlertRuleVersion.objects.create(
                rule=rule, number=1, field=field, pre=pre, threshold_a=a, mid=mid, threshold_b=b, post=post,
                level=level, message=message, lab_test_code=test_code, lab_check=check, vital=vital,
                answer_check=STARTER_ANSWER_CHECKS.get(code, ''), medicine_terms=STARTER_MEDICINE_TERMS.get(code, []),
                note='Starter list from the forms doc', created_by=None,
            )
    if not ScoreBandSet.objects.filter(organization=organization, code='mrs').exists():
        band_set = ScoreBandSet.objects.create(organization=organization, code='mrs', name='MRS total score')
        ScoreBandVersion.objects.create(band_set=band_set, number=1, bands=STARTER_MRS_BANDS,
                                        note='Starter bands from the forms doc', created_by=None)
    templates = EmailTemplate.objects.filter(organization=organization)
    if not templates.exclude(kind=TemplateKind.PHRASE).exists():
        for spec in starter_templates():
            what = spec.pop('what')
            subject = spec.pop('subject', '')
            template = EmailTemplate.objects.create(organization=organization, pinned=spec['key'] in STARTER_PINNED,
                                                    **spec)
            EmailTemplateVersion.objects.create(
                template=template, number=1, subject=subject, body=_placeholder(what),
                note='Empty slot: replace with the clinic master copy', created_by=None,
            )
    if not templates.filter(kind=TemplateKind.PHRASE).exists():
        now = timezone.now()
        for position, (key, (name, text, _)) in enumerate(STARTER_PHRASES.items(), start=1):
            if text is None:
                continue
            template = EmailTemplate.objects.create(organization=organization, key=key, name=name,
                                                    kind=TemplateKind.PHRASE, sort_order=position * 10)
            EmailTemplateVersion.objects.create(
                template=template, number=1, body=text, approved_at=now, created_by=None,
                note='System phrase moved from code' if key in MOVED_PHRASES else 'System phrase',
            )
