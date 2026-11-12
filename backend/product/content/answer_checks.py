"""
The named checks an alert rule can run over the patient's form answers (AlertRuleVersion.answer_check).

Codes only, with a short label for the rules screen. The checks themselves live in
product.alerts.answer_rules.REGISTRY, whose keys must equal these; content never imports alerts.
"""

# code -> label (the forms-doc question it reads)
ANSWER_CHECKS: dict[str, str] = {
    'breast_cancer': 'Breast cancer (ever), 6A',
    'coronary_disease': 'Heart attack, angina or known coronary disease, 6A',
    'stroke_tia': 'Stroke or mini-stroke (TIA), 6A',
    'vte': 'Blood clot in leg or lung (DVT/PE), 6A',
    'liver_disease': 'Active liver disease, 6A',
    'unexplained_bleeding': 'Unexplained vaginal bleeding now, 6A',
    'bleeding_after_year': 'Any bleeding 12 months after the last period, 3',
    'intermenstrual_bleeding': 'Bleeding between periods or after sex, 3',
    'peanut_allergy_progesterone': 'Peanut allergy with a current medicine, 7',
    'pregnancy_pain_bleeding': 'Could you be pregnant, with pain or bleeding, 5 / 10b',
    'pelvic_pain_fever': 'Pelvic pain with fever, 10b',
    'breast_concern': 'Breast lump, discharge or skin change, 10b',
    'self_harm': 'Self-harm question, 6D',
    'age_or_years_since_period': 'Age, or years since the last period or menopause, 2 / 3',
    'menopause_age': 'Age at menopause, 3',
    'migraine_aura': 'Migraine with aura, 6B',
    'smoking': 'Smoker / vaper, 6B',
    'alcohol_units': 'Units or drinks per week, 9',
    'fh_breast_cancer': 'Family history of breast cancer, 8',
    'fh_ovarian_brca': 'Family history of ovarian cancer or a cancer gene, 8',
    'fh_vte': 'Family history of blood clots, 8',
    'fh_premature_cvd': 'Family history of heart attack or stroke at a young age, 8',
    'pregnancy_complications': 'Pregnancy complications, 5',
    'phq2_gad2': 'PHQ-2 or GAD-2 score, 6D',
    'mrs_heart': 'MRS item 2, heart discomfort, 4',
    'desire_bother': 'Low desire that bothers you, 10',
    'medicine_listed': 'A listed supplement or medicine, 7',
    'utis_per_year': 'Urine infections in the last year, 10',
    'mammogram_date': 'Last mammogram date, 5',
    'smear_date': 'Last cervical smear date, 5',
    'lng_ius_date': 'LNG-IUS insertion date, 5',
}
