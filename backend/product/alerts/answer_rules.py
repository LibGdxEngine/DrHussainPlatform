"""
The answer checks: what each alert rule linked by `AlertRuleVersion.answer_check` reads from the
patient's forms (the plan's rule-input table, from the forms doc).

Each check is `(history, version, medicine_names) -> (fires, form, detail)`:
    history         intake.history.PatientHistory
    version         the rule's AlertRuleVersion (cut-offs in threshold_a / threshold_b, medicine_terms)
    medicine_names  product.medicines.current_medicine_names, already normalised
    form            the IntakeForm whose answer fired the rule, or None (e.g. from the age alone)

Scopes: `history.latest(qid)` for answers about now (bleeding, pain, mood), `history.merged(qid)`
for history that carries forward. An unanswered question never fires a rule; the self-harm
question's "prefer not to say" does, as does the Part A "prefer to discuss with the doctor".
"""
import calendar
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from product.medicines import matches_terms, normalise_medicine

YES = 'yes'
UNSURE = 'unsure'
DISCUSS = 'discuss'  # Part A: "Prefer to discuss with the doctor"
PREFER_NOT = 'prefer_not'
NOT_SURE = 'not_sure'
FIRST_DEGREE = {'mother', 'sister', 'daughter', 'father', 'brother'}
MALE_RELATIVES = {'father', 'brother'}
FEMALE_RELATIVES = {'mother', 'sister', 'daughter'}
PREFERS_TO_DISCUSS = 'Patient prefers to discuss'

NO_FIRE = (False, None, '')


def _number(value) -> Decimal | None:
    """A number from an answer or a cut-off; None for blanks, "[set]", "not sure" and the like."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        return Decimal(str(value).strip().replace(',', '.'))
    except InvalidOperation:
        return None


def _fmt(number: Decimal) -> str:
    return f'{number.normalize():f}'


def _date(value) -> date | None:
    """An answered date, exactly "YYYY-MM-DD" (as the form checks it); anything else is no date."""
    text = value.strip() if isinstance(value, str) else ''
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _months_before(day: date, months: int) -> date:
    """The same day `months` calendar months earlier (that month's last day when it is shorter)."""
    year, month = divmod(day.year * 12 + day.month - 1 - months, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _rows(value) -> list[dict]:
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def _relative(row) -> str:
    return str(row.get('relative') or '').strip().casefold()


# R1-R6: Part A, "yes" or "prefer to discuss" fires.
def _part_a(qid, scope, extra=()):
    def check(history, version, medicine_names):
        answer = getattr(history, scope)(qid)
        if answer == DISCUSS:
            return True, history.form_for(qid), PREFERS_TO_DISCUSS
        if answer != YES:
            return NO_FIRE
        details = [str(v) for v in (history.merged(e) for e in extra) if v not in (None, '')]
        return True, history.form_for(qid), ', '.join(details)
    return check


def _equals(qid, scope, wanted):
    def check(history, version, medicine_names):
        if getattr(history, scope)(qid) != wanted:
            return NO_FIRE
        return True, history.form_for(qid), ''
    return check


def peanut_allergy_progesterone(history, version, medicine_names):
    """R11: a peanut allergy and a current medicine that matches the rule's terms."""
    if history.merged('peanut_allergy') != YES:
        return NO_FIRE
    matched = matches_terms(medicine_names, version.medicine_terms)
    if not matched:
        return NO_FIRE
    return True, history.form_for('peanut_allergy'), ', '.join(matched)


def pregnancy_pain_bleeding(history, version, medicine_names):
    """R12: could be pregnant (yes or not sure) with pain or bleeding on the latest form."""
    if history.latest('pregnant') not in (YES, UNSURE):
        return NO_FIRE
    pain = _number(history.latest('pain_score'))
    bleed_days = _number(history.latest('bleed_days'))
    signs = []
    if pain is not None and pain >= 1:
        signs.append(f'pain {_fmt(pain)}/10')
    if YES in (history.latest('intermenstrual'), history.latest('bleed_after_year')) or (
            bleed_days is not None and bleed_days >= 1):
        signs.append('bleeding')
    if not signs:
        return NO_FIRE
    return True, history.form_for('pregnant'), f'Pregnant: {history.latest("pregnant")}; {", ".join(signs)}'


def pelvic_pain_fever(history, version, medicine_names):
    """R13: pelvic pain (pain module score or infection module question) with fever."""
    pain = _number(history.latest('pain_score'))
    has_pain = (pain is not None and pain >= 1) or history.latest('inf_pelvic_pain') == YES
    fever_qid = next((q for q in ('pain_fever', 'inf_fever') if history.latest(q) == YES), None)
    if not (has_pain and fever_qid):
        return NO_FIRE
    return True, history.form_for(fever_qid), ''


def breast_concern(history, version, medicine_names):
    """R14: a lump not known to be old, a skin change, or discharge that is (or may be) bloody."""
    symptoms = history.latest('breast_symptoms')
    symptoms = set(symptoms) if isinstance(symptoms, list) else set()
    found = []
    if 'lump' in symptoms and history.latest('breast_lump_new') != 'no':
        found.append('lump')
    if 'skin' in symptoms:
        found.append('skin change')
    if 'discharge' in symptoms and history.latest('breast_discharge_bloody') in (YES, UNSURE):
        found.append('discharge')
    if not found:
        return NO_FIRE
    return True, history.form_for('breast_symptoms'), ', '.join(found)


def self_harm(history, version, medicine_names):
    """R15: any answer other than "Not at all" (0); "prefer not to say" fires too."""
    answer = history.latest('self_harm')
    if answer is None or answer == '':
        return NO_FIRE
    if answer == PREFER_NOT:
        return True, history.form_for('self_harm'), 'Prefer not to say'
    score = _number(answer)
    if score is None or score == 0:
        return NO_FIRE
    return True, history.form_for('self_harm'), f'Score {_fmt(score)}'


def age_or_years_since_period(history, version, medicine_names):
    """R16: age >= threshold_a, or more than threshold_b years since the last period or menopause."""
    max_age, max_years = _number(version.threshold_a), _number(version.threshold_b)
    age, years = history.age, history.years_since_lmp
    if max_age is not None and age is not None and age >= max_age:
        return True, None, f'Age {age} ≥ {_fmt(max_age)}'
    if max_years is not None and years is not None and Decimal(str(years)) > max_years:
        form = history.form_for('last_period') or history.form_for('menopause_age')
        return True, form, f'{years:.1f} years since the last period > {_fmt(max_years)}'
    return NO_FIRE


def menopause_age(history, version, medicine_names):
    """R17: age at menopause below threshold_a ("POI" below threshold_b); "not sure" never fires."""
    age = _number(history.merged('menopause_age'))
    early, poi = _number(version.threshold_a), _number(version.threshold_b)
    if age is None or early is None or age >= early:
        return NO_FIRE
    detail = f'Menopause at {_fmt(age)} < {_fmt(early)}'
    if poi is not None and age < poi:
        detail += f' (POI, < {_fmt(poi)})'
    return True, history.form_for('menopause_age'), detail


def smoking(history, version, medicine_names):
    """R19: current smoker or vaper; the detail notes when her age reaches threshold_a."""
    if history.merged('smoking') != 'current':
        return NO_FIRE
    detail = 'Current smoker'
    cut_off, age = _number(version.threshold_a), history.age
    if cut_off is not None and age is not None and age >= cut_off:
        detail += f', age {age} ≥ {_fmt(cut_off)}'
    return True, history.form_for('smoking'), detail


def alcohol_units(history, version, medicine_names):
    """R23: units or drinks per week >= threshold_a."""
    units, cut_off = _number(history.merged('alcohol_units')), _number(version.threshold_a)
    if units is None or cut_off is None or units < cut_off:
        return NO_FIRE
    return True, history.form_for('alcohol_units'), f'{_fmt(units)} units/week ≥ {_fmt(cut_off)}'


def fh_breast_cancer(history, version, medicine_names):
    """R24: a first-degree relative diagnosed before threshold_a, or threshold_b or more relatives."""
    rows = _rows(history.merged('fh_breast_cancer'))
    young, count = _number(version.threshold_a), _number(version.threshold_b)
    early = [r for r in rows if _relative(r) in FIRST_DEGREE and young is not None
             and (age := _number(r.get('age'))) is not None and age < young]
    if early:
        return True, history.form_for('fh_breast_cancer'), f'{_relative(early[0])} diagnosed before {_fmt(young)}'
    if count is not None and rows and len(rows) >= count:
        return True, history.form_for('fh_breast_cancer'), f'{len(rows)} relatives'
    return NO_FIRE


def fh_ovarian_brca(history, version, medicine_names):
    """R25: any relative with ovarian cancer, or a known BRCA or other cancer gene."""
    if _rows(history.merged('fh_ovarian_cancer')):
        return True, history.form_for('fh_ovarian_cancer'), 'Ovarian cancer'
    if history.merged('fh_brca') == YES:
        return True, history.form_for('fh_brca'), 'Cancer gene'
    return NO_FIRE


def fh_vte(history, version, medicine_names):
    """R26: a first-degree relative with blood clots."""
    relatives = [_relative(r) for r in _rows(history.merged('fh_vte')) if _relative(r) in FIRST_DEGREE]
    if not relatives:
        return NO_FIRE
    return True, history.form_for('fh_vte'), ', '.join(relatives)


def fh_premature_cvd(history, version, medicine_names):
    """R27: a father or brother younger than threshold_a, or a mother, sister or daughter younger than threshold_b."""
    men, women = _number(version.threshold_a), _number(version.threshold_b)
    for row in _rows(history.merged('fh_premature_cvd')):
        relative, age = _relative(row), _number(row.get('age'))
        cut_off = men if relative in MALE_RELATIVES else women if relative in FEMALE_RELATIVES else None
        if age is not None and cut_off is not None and age < cut_off:
            return True, history.form_for('fh_premature_cvd'), f'{relative} at {_fmt(age)} < {_fmt(cut_off)}'
    return NO_FIRE


def pregnancy_complications(history, version, medicine_names):
    """R28: preeclampsia, gestational diabetes or preterm birth."""
    found = [q for q in ('preeclampsia', 'gestational_diabetes', 'preterm') if history.merged(q) == YES]
    if not found:
        return NO_FIRE
    return True, history.form_for(found[0]), ', '.join(q.replace('_', ' ') for q in found)


def phq2_gad2(history, version, medicine_names):
    """R29: PHQ-2 or GAD-2 sum >= threshold_a, from the latest form ("prefer not to say" adds nothing)."""
    cut_off = _number(version.threshold_a)
    if cut_off is None:
        return NO_FIRE
    for name, items in (('PHQ-2', ('phq2_interest', 'phq2_down')), ('GAD-2', ('gad2_nervous', 'gad2_worry'))):
        scores = [s for s in (_number(history.latest(q)) for q in items) if s is not None]
        if scores and sum(scores) >= cut_off:
            return True, history.form_for(items[0]) or history.form_for(items[1]), \
                f'{name} {_fmt(sum(scores))} ≥ {_fmt(cut_off)}'
    return NO_FIRE


def mrs_heart(history, version, medicine_names):
    """R30: MRS item 2 (heart discomfort) >= threshold_a, from the newest form with an MRS."""
    scores, cut_off = history.mrs, _number(version.threshold_a)
    if not scores or len(scores) < 2 or cut_off is None or scores[1] is None or scores[1] < cut_off:
        return NO_FIRE
    return True, history.mrs_form, f'MRS item 2: {scores[1]} ≥ {_fmt(cut_off)}'


def medicine_listed(history, version, medicine_names):
    """R32: a supplement or current medicine that matches the rule's terms (e.g. St John's Wort)."""
    supplements = [r if isinstance(r, str) else str(r.get('name') or '') for r in
                   (history.merged('supplements') or []) if isinstance(r, (str, dict))]
    matched = matches_terms(supplements, version.medicine_terms)
    if matched:
        return True, history.form_for('supplements'), ', '.join(normalise_medicine(m) for m in matched)
    matched = matches_terms(medicine_names, version.medicine_terms)
    if matched:
        return True, history.form_for('current_medicines'), ', '.join(matched)
    return NO_FIRE


def utis_per_year(history, version, medicine_names):
    """R33: threshold_a or more urine infections in the last year, and postmenopausal."""
    count, cut_off = _number(history.merged('utis_last_year')), _number(version.threshold_a)
    if count is None or cut_off is None or count < cut_off or not history.postmenopausal:
        return NO_FIRE
    return True, history.form_for('utis_last_year'), f'{_fmt(count)} UTIs ≥ {_fmt(cut_off)}, postmenopausal'


def _date_older_than(qid, unit, *, inclusive):
    """
    Fires when the answered date is more than threshold_a months or years ago (or exactly that long
    when `inclusive`). Silent while the cut-off is "[set]" or not a whole number.
    """
    def check(history, version, medicine_names):
        when, cut_off = _date(history.merged(qid)), _number(version.threshold_a)
        if when is None or cut_off is None or cut_off != cut_off.to_integral_value():
            return NO_FIRE
        boundary = _months_before(date.today(), int(cut_off) * (12 if unit == 'years' else 1))
        if not (when < boundary or (inclusive and when == boundary)):
            return NO_FIRE
        return True, history.form_for(qid), f'{when.isoformat()}, {_fmt(cut_off)} {unit} ago or more'
    return check


REGISTRY = {
    'breast_cancer': _part_a('hs_breast_cancer', 'merged', extra=('hs_breast_cancer_type', 'hs_breast_cancer_year')),
    'coronary_disease': _part_a('hs_coronary', 'merged'),
    'stroke_tia': _part_a('hs_stroke', 'merged'),
    'vte': _part_a('hs_vte', 'merged'),
    'liver_disease': _part_a('hs_liver', 'merged'),
    'unexplained_bleeding': _part_a('hs_unexplained_bleeding', 'latest'),
    'bleeding_after_year': _equals('bleed_after_year', 'latest', YES),
    'intermenstrual_bleeding': _equals('intermenstrual', 'latest', YES),
    'peanut_allergy_progesterone': peanut_allergy_progesterone,
    'pregnancy_pain_bleeding': pregnancy_pain_bleeding,
    'pelvic_pain_fever': pelvic_pain_fever,
    'breast_concern': breast_concern,
    'self_harm': self_harm,
    'age_or_years_since_period': age_or_years_since_period,
    'menopause_age': menopause_age,
    'migraine_aura': _equals('hs_migraine', 'merged', 'with_aura'),
    'smoking': smoking,
    'alcohol_units': alcohol_units,
    'fh_breast_cancer': fh_breast_cancer,
    'fh_ovarian_brca': fh_ovarian_brca,
    'fh_vte': fh_vte,
    'fh_premature_cvd': fh_premature_cvd,
    'pregnancy_complications': pregnancy_complications,
    'phq2_gad2': phq2_gad2,
    'mrs_heart': mrs_heart,
    'desire_bother': _equals('desire_bother', 'latest', 'a_lot'),
    'medicine_listed': medicine_listed,
    'utis_per_year': utis_per_year,
    'mammogram_date': _date_older_than('last_mammogram_date', 'months', inclusive=False),
    'smear_date': _date_older_than('last_smear_date', 'months', inclusive=False),
    'lng_ius_date': _date_older_than('lng_ius_date', 'years', inclusive=True),
}
