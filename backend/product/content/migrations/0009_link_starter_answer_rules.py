"""
Link the starter answer rules to the checks that read the patient form, for clinics whose rules
were loaded before forms fed the rules, and bring the starter text of R7, R15 and R31 in line with
the forms doc. R34 (and the medicine rules R11, R32) gain their default medicine terms. A new
version is added; earlier versions are never edited. Rules the clinic has reworded are left alone,
and a rule already linked is skipped, so running this twice adds nothing.
"""
from django.db import migrations

# code: (starter field, answer check)
CHECKS = {
    'R1': ('Breast cancer (6a)', 'breast_cancer'),
    'R2': ('Coronary disease, MI or angina (6a)', 'coronary_disease'),
    'R3': ('Stroke or TIA (6a)', 'stroke_tia'),
    'R4': ('DVT or PE (6a)', 'vte'),
    'R5': ('Active liver disease (6a)', 'liver_disease'),
    'R6': ('Current unexplained bleeding (6a)', 'unexplained_bleeding'),
    'R7': ('Bleeding since last period (3)', 'bleeding_after_year'),
    'R8': ('Postcoital or intermenstrual bleeding (3)', 'intermenstrual_bleeding'),
    'R11': ('Peanut allergy + prescription', 'peanut_allergy_progesterone'),
    'R12': ('Possible pregnancy (5 / 10b)', 'pregnancy_pain_bleeding'),
    'R13': ('Pelvic pain (10b)', 'pelvic_pain_fever'),
    'R14': ('Breast concern (10b)', 'breast_concern'),
    'R15': ('Self-harm question (6d)', 'self_harm'),
    'R16': ('Age or time since last period (2, 3)', 'age_or_years_since_period'),
    'R17': ('Age at menopause (3)', 'menopause_age'),
    'R18': ('Migraine (6b)', 'migraine_aura'),
    'R19': ('Smoking (6b)', 'smoking'),
    'R23': ('Alcohol (9)', 'alcohol_units'),
    'R24': ('Family history of breast cancer (8)', 'fh_breast_cancer'),
    'R25': ('Family history of ovarian cancer or BRCA (8)', 'fh_ovarian_brca'),
    'R26': ('Family history of VTE (8)', 'fh_vte'),
    'R27': ('Family history of premature heart disease (8)', 'fh_premature_cvd'),
    'R28': ('Pregnancy complications (5)', 'pregnancy_complications'),
    'R29': ('PHQ-2 or GAD-2 (6d)', 'phq2_gad2'),
    'R30': ('MRS item 2, heart discomfort (4)', 'mrs_heart'),
    'R31': ('Distressing low desire (10)', 'desire_bother'),
    'R32': ("St John's Wort (7)", 'medicine_listed'),
    'R33': ('UTIs per year (10b)', 'utis_per_year'),
    'R36': ('Mammogram date (5)', 'mammogram_date'),
    'R37': ('Cervical smear date (5)', 'smear_date'),
    'R38': ('LNG-IUS insertion date (5)', 'lng_ius_date'),
}

MEDICINE_TERMS = {
    'R11': ['prometrium', 'micronised progesterone', 'micronized progesterone'],
    'R32': ["st john's wort", 'st johns wort', 'hypericum'],
}

# Lab rules that also need a current medicine: code -> (starter field, terms).
LAB_MEDICINE_TERMS = {
    'R34': ('Total testosterone (labs)', ['testosterone']),
}

# Starter text corrected to the forms doc: code -> (starter text, corrected text, note), each a dict
# of the version fields. Applied only while the rule still has the starter text.
TEXT_FIXES = {
    'R7': ({'pre': '≥', 'threshold_a': '12', 'mid': 'months'}, {'pre': '= Yes', 'threshold_a': None, 'mid': ''},
           'R7: the 12 months is part of the question, not a cut-off'),
    'R15': ({'pre': 'any answer other than "Never"'}, {'pre': "any answer other than 'Not at all'"}, ''),
    'R31': ({'pre': '"Very much"'}, {'pre': '"A lot"'}, ''),
    'R38': ({'mid': 'years'}, {'mid': 'years'}, ''),
}

COPIED = ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled',
          'lab_test_code', 'lab_check', 'vital', 'answer_check', 'medicine_terms')


def _add_version(AlertRuleVersion, rule, current, changes, note):
    values = {name: getattr(current, name) for name in COPIED}
    values.update(changes)
    AlertRuleVersion.objects.create(rule=rule, number=current.number + 1, note=note, created_by=None, **values)


def link(apps, schema_editor):
    AlertRule = apps.get_model('content', 'AlertRule')
    AlertRuleVersion = apps.get_model('content', 'AlertRuleVersion')
    for rule in AlertRule.objects.filter(code__in=[*CHECKS, *LAB_MEDICINE_TERMS]):
        current = AlertRuleVersion.objects.filter(rule=rule).order_by('-number').first()
        if current is None:
            continue
        if rule.code in LAB_MEDICINE_TERMS:
            field, terms = LAB_MEDICINE_TERMS[rule.code]
            if current.field == field and not current.medicine_terms:
                _add_version(AlertRuleVersion, rule, current, {'medicine_terms': terms},
                             'Fires only with a matching current medicine')
            continue
        field, check = CHECKS[rule.code]
        if current.field != field or current.answer_check or current.lab_check or current.vital:
            continue
        changes = {'answer_check': check}
        if not current.medicine_terms and rule.code in MEDICINE_TERMS:
            changes['medicine_terms'] = MEDICINE_TERMS[rule.code]
        note = 'Checked against form answers'
        starter, fixed, fix_note = TEXT_FIXES.get(rule.code, ({}, {}, ''))
        if starter and all(getattr(current, name) == value for name, value in starter.items()):
            changes.update(fixed)
            note = fix_note or 'Checked against form answers; wording as in the forms doc'
        _add_version(AlertRuleVersion, rule, current, changes, note)


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0008_answer_checks_phrases_translation'),
    ]

    operations = [
        migrations.RunPython(link, migrations.RunPython.noop),
    ]
