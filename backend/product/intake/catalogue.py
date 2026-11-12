"""
The patient form's question catalogue: sections, questions and when each section opens.

The wording comes from the forms doc ("Questionnaires & History Forms", sections 2-12). Where the doc
names only a topic, the topic is the label. Questions marked `inferred` are not in the doc as
questions: they are read from an alert rule's wording and are listed for the clinic to confirm.

Each section in SECTIONS is a dict with:
    id          the module id (what `extra_modules` holds when `addable`)
    title       the forms-doc heading
    kinds       the form kinds it belongs to ('full', 'followup')
    addable     the doctor or staff can add it to a form (`extra_modules`)
    opens_when  a condition (below), evaluated by modules_for
    intro       optional opening line shown above the questions
    questions   [{id, label, type, options?, fields?, show_if?, required?, carry_forward, inferred?,
                  also_in?, rules?, flag?, min?, max?, max_length?, max_rows?, not_sure?}, ...]

Question types: single, multi (options), number (min, max, optional not_sure), scale (min, max),
text (max_length), date (YYYY-MM-DD), tick (true/false), rows (repeating rows of `fields`), and
mrs (the Menopause Rating Scale, stored in IntakeForm.mrs, never in the answers).

A question is shown when its section (or any section in `also_in`) is open and its `show_if` holds.
It is asked once: the form places it in the first open section of [its section, *also_in].
`required` is True or a condition; it applies only when the question is shown.

Conditions are plain data, so the form can evaluate them too:
    {'always': True}
    {'answer': qid, 'in': [values]}       for a list answer: any element is in values
    {'answer': qid, 'not_in': [values]}   the negation of 'in' (true when unanswered)
    {'answered': qid}
    {'age_gte': n}                        the patient's age in whole years
    {'module': section_id}                an open section (opens_when may only name earlier sections)
    {'all': [conditions]}, {'any': [conditions]}, {'not': condition}
"""
import re
from typing import Any

CATALOGUE_VERSION = '1'

DISCUSS = 'discuss'
PREFER_NOT = 'prefer_not'
NOT_SURE = 'not_sure'

# Alert levels from the forms doc's rule table (section 13), used to highlight answers.
RULE_LEVELS = {
    **{f'R{n}': 'red' for n in range(1, 16)},
    **{f'R{n}': 'amber' for n in range(16, 36)},
    **{f'R{n}': 'reminder' for n in range(36, 41)},
}


def _opts(*pairs) -> list[dict]:
    return [{'value': value, 'label': label} for value, label in pairs]


YES_NO = _opts(('yes', 'Yes'), ('no', 'No'))
YES_NO_UNSURE = _opts(('yes', 'Yes'), ('no', 'No'), ('unsure', 'Not sure'))
# Part A answers. "Prefer to discuss with the doctor" is not in the forms doc (open question).
YES_NO_DISCUSS = _opts(('yes', 'Yes'), ('no', 'No'), (DISCUSS, 'Prefer to discuss with the doctor'))
YES_PARTLY_NO = _opts(('yes', 'Yes'), ('partly', 'Partly'), ('no', 'No'))
NORMAL_ABNORMAL = _opts(('normal', 'Normal'), ('abnormal', 'Abnormal'))
RELATIVES = _opts(('mother', 'Mother'), ('sister', 'Sister'), ('daughter', 'Daughter'), ('father', 'Father'),
                  ('brother', 'Brother'))
# PHQ-2 / GAD-2 / PHQ-9 standard answers, scored 0-3, plus "Prefer not to say".
MOOD_SCALE = _opts((0, 'Not at all'), (1, 'Several days'), (2, 'More than half the days'),
                   (3, 'Nearly every day'), (PREFER_NOT, 'Prefer not to say'))
MOOD_INTRO = 'Over the last 2 weeks, how often have you been bothered by any of the following problems?'

VISIT_REASONS = _opts(
    ('routine', 'Routine check / smear'),
    ('heavy', 'Heavy or irregular periods'),
    ('bleed', 'Bleeding between periods, after sex or after menopause'),
    ('pain', 'Pelvic or period pain'),
    ('contra', 'Contraception'),
    ('ttc', 'Trying to conceive'),
    ('pcos', 'PCOS, acne or excess hair'),
    ('dis', 'Discharge or infection'),
    ('uri', 'Urinary leak or prolapse'),
    ('pms', 'PMS'),
    ('smear', 'Abnormal smear follow-up'),
    ('breast', 'Breast concern'),
    ('meno', 'Menopause symptoms (flushes, sleep, mood)'),
    ('hrt', 'HRT review'),
    ('lib', 'Low libido or vaginal dryness'),
    ('other', 'Other'),
)
CONTRACEPTION = _opts(
    ('none', 'None'), ('pill', 'Pill'), ('mini_pill', 'Mini-pill'), ('lng_ius', 'LNG-IUS (Mirena)'),
    ('copper_iud', 'Copper IUD'), ('implant', 'Implant'), ('injection', 'Injection'), ('condoms', 'Condoms'),
    ('sterilised', 'Sterilised'), ('partner_vasectomy', 'Partner vasectomy'),
)
STOPPED = {'answer': 'period_status', 'in': ['stopped']}


def _q(qid, label, qtype, **extra) -> dict:
    question = {'id': qid, 'label': label, 'type': qtype, 'carry_forward': False}
    question.update(extra)
    return question


def _yes_no(qid, label, **extra) -> dict:
    return _q(qid, label, 'single', options=YES_NO, **extra)


def _relatives(qid, label, *, with_age, **extra) -> dict:
    fields = [{'id': 'relative', 'label': 'Relative', 'type': 'single', 'options': RELATIVES, 'required': True}]
    if with_age:
        fields.append({'id': 'age', 'label': 'Age at diagnosis', 'type': 'number', 'min': 0, 'max': 120})
    return _q(qid, label, 'rows', fields=fields, max_rows=10, carry_forward=True, **extra)


def _carry(questions: list[dict]) -> list[dict]:
    for question in questions:
        question['carry_forward'] = True
    return questions


ALWAYS = {'always': True}

SECTIONS: list[dict[str, Any]] = [
    # --- Core intake (full form) ---------------------------------------------------------------
    {
        'id': 'details', 'title': 'Patient details and reason for visit', 'kinds': ['full'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': [
            _q('reasons', 'Main reason for visit', 'multi', options=VISIT_REASONS, required=True),
            _q('other_reason', 'Other', 'text', max_length=500, show_if={'answer': 'reasons', 'in': ['other']}),
            _q('referring_doctor', 'Referring doctor', 'text', max_length=200),
            _q('bothering_most', 'In your own words, what is bothering you most?', 'text', max_length=2000),
            _q('visit_goals', 'What would you like to get from this visit?', 'text', max_length=2000),
            _q('last_felt_well', 'When did you last feel really well?', 'text', max_length=500),
            _q('better_or_worse', 'What makes your symptoms better or worse?', 'text', max_length=2000),
        ],
    },
    {
        'id': 'periods', 'title': 'Menstrual and menopause history', 'kinds': ['full'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': [
            # Free text (e.g. "August 2025" or "Not sure"), as stored before the catalogue.
            _q('last_period', 'Date of last menstrual period (LMP)', 'text', max_length=40),
            _q('period_status', 'Periods now', 'single', options=_opts(
                ('reg', 'Regular'), ('irr', 'Irregular'), ('stopped', 'Stopped'),
                ('horm', "On hormones so can't tell"), ('hyst', 'Hysterectomy')), required=True),
            _q('cycle_length', 'Cycle length', 'number', min=1, max=365),
            _q('period_days', 'Days of bleeding', 'number', min=0, max=60),
            _yes_no('heavy_bleeding', 'Heavy bleeding (flooding, clots, changing pad <2 h)'),
            _yes_no('intermenstrual', 'Bleeding between periods or after sex', rules=['R8', 'R12'], flag=['yes']),
            _yes_no('bleed_after_year', 'Any bleeding 12 months after LMP', rules=['R7', 'R12'], flag=['yes'],
                    required=STOPPED),
            # The doc names the menopause trigger ("hot flushes or night sweats") but not the question.
            _yes_no('flushes_sweats', 'Hot flushes or night sweats', inferred=True),
            _q('menopause_age', 'Age at menopause', 'number', min=20, max=70, not_sure=True, rules=['R16', 'R17'],
               show_if={'any': [{'module': 'menopause'}, STOPPED]}, required=STOPPED),
            _q('how_periods_stopped', 'How did periods stop', 'single', options=_opts(
                ('natural', 'Natural'), ('hysterectomy_ovaries_kept', 'Hysterectomy with ovaries kept'),
                ('ovaries_removed', 'Ovaries removed (surgical)'),
                ('chemo_radio', 'Chemotherapy or radiotherapy'), ('gnrh', 'GnRH treatment')),
               show_if={'any': [{'module': 'menopause'}, STOPPED]}, required=STOPPED),
            _yes_no('uterus', 'Uterus present', required=STOPPED),
            _q('ovaries', 'Ovaries present', 'single',
               options=_opts(('both', 'Both'), ('one', 'One'), ('none', 'None')),
               show_if={'any': [{'module': 'menopause'}, STOPPED]}, required=STOPPED),
            _q('menarche_age', 'Age at first period', 'number', min=5, max=25),
            _yes_no('pms_history', 'PMS or mood changes before periods (past or present)'),
        ],
    },
    {
        'id': 'menopause', 'title': 'Menopause Rating Scale (MRS)', 'kinds': ['full'], 'addable': True,
        'opens_when': {'any': [
            {'answer': 'reasons', 'in': ['meno', 'hrt']},
            {'all': [{'age_gte': 40}, {'answer': 'period_status', 'in': ['irr', 'stopped']}]},
            {'answer': 'flushes_sweats', 'in': ['yes']},
        ]},
        'questions': [
            _q('mrs', 'Which of the following symptoms apply to you at this time? Tick one box for each.', 'mrs',
               rules=['R30']),
        ],
    },
    {
        'id': 'obstetric', 'title': 'Gynae, obstetric and contraception history', 'kinds': ['full'],
        'addable': False, 'opens_when': ALWAYS,
        'questions': [
            *_carry([
                _q('pregnancies', 'Number of pregnancies', 'number', min=0, max=30),
                _q('births', 'Number of births', 'number', min=0, max=30),
                _q('miscarriages', 'Number of miscarriages', 'number', min=0, max=30),
                _yes_no('preeclampsia', 'Pre-eclampsia or high blood pressure in pregnancy', rules=['R28'],
                        flag=['yes']),
                _yes_no('gestational_diabetes', 'Gestational diabetes', rules=['R28'], flag=['yes']),
                _yes_no('preterm', 'Preterm delivery (<37 weeks)', rules=['R28'], flag=['yes']),
            ]),
            _q('pregnant', 'Could you be pregnant?', 'single', options=YES_NO_UNSURE, rules=['R12'],
               flag=['yes', 'unsure'], show_if={'answer': 'period_status', 'not_in': ['stopped']}),
            *_carry([
                _q('contraception', 'Current contraception', 'single', options=CONTRACEPTION),
                _q('lng_ius_date', 'LNG-IUS insertion date', 'date', rules=['R38'],
                   show_if={'answer': 'contraception', 'in': ['lng_ius']}),
                _q('gynae_conditions', 'Gynae conditions', 'multi', options=_opts(
                    ('fibroids', 'Fibroids'), ('endometriosis', 'Endometriosis'), ('adenomyosis', 'Adenomyosis'),
                    ('pcos', 'PCOS'), ('ovarian_cysts', 'Ovarian cysts'),
                    ('endometrial_hyperplasia', 'Endometrial hyperplasia'), ('prolapse', 'Prolapse'),
                    ('other', 'Other'))),
                _q('gynae_operations', 'Gynae operations', 'rows', max_rows=10, fields=[
                    {'id': 'operation', 'label': 'Operation', 'type': 'single', 'required': True, 'options': _opts(
                        ('hysterectomy', 'Hysterectomy'), ('ovary_removal', 'Ovary removal'),
                        ('endometrial_ablation', 'Endometrial ablation'), ('myomectomy', 'Myomectomy'),
                        ('other', 'Other'))},
                    {'id': 'date', 'label': 'Date', 'type': 'date'},
                ]),
                _q('last_smear_date', 'Last cervical screening', 'date', rules=['R37']),
                _q('last_smear_result', 'Last cervical screening result', 'single', options=NORMAL_ABNORMAL),
                _q('last_mammogram_date', 'Last mammogram', 'date', rules=['R36']),
                _q('last_mammogram_result', 'Last mammogram result', 'single', options=NORMAL_ABNORMAL),
            ]),
        ],
    },
    {
        'id': 'hormone_screen', 'title': 'Hormone safety screen', 'kinds': ['full'], 'addable': True,
        'opens_when': {'any': [{'module': 'menopause'}, {'answer': 'reasons', 'in': ['contra']}]},
        'questions': _carry([
            # A. Stop-and-review conditions (systemic HRT): every one is required.
            _q('hs_breast_cancer', 'Breast cancer (ever)', 'single', options=YES_NO_DISCUSS, required=True,
               rules=['R1'], flag=['yes', DISCUSS]),
            _q('hs_breast_cancer_type', 'Breast cancer type', 'single',
               options=_opts(('er_pos', 'ER+'), ('er_neg', 'ER-'), ('unknown', 'Unknown')),
               show_if={'answer': 'hs_breast_cancer', 'in': ['yes']}),
            _q('hs_breast_cancer_year', 'Breast cancer year', 'number', min=1900, max=2100,
               show_if={'answer': 'hs_breast_cancer', 'in': ['yes']}),
            _q('hs_coronary', 'Heart attack, angina or known coronary disease', 'single', options=YES_NO_DISCUSS,
               required=True, rules=['R2'], flag=['yes', DISCUSS]),
            _q('hs_stroke', 'Stroke or mini-stroke (TIA)', 'single', options=YES_NO_DISCUSS, required=True,
               rules=['R3'], flag=['yes', DISCUSS]),
            _q('hs_vte', 'Blood clot in leg or lung (DVT/PE)', 'single', options=YES_NO_DISCUSS, required=True,
               rules=['R4'], flag=['yes', DISCUSS]),
            _q('hs_unexplained_bleeding', 'Unexplained vaginal bleeding now', 'single', options=YES_NO_DISCUSS,
               required=True, rules=['R6'], flag=['yes', DISCUSS]),
            _q('hs_liver', 'Active liver disease', 'single', options=YES_NO_DISCUSS, required=True, rules=['R5'],
               flag=['yes', DISCUSS]),
            _q('hs_cancer_treatment', 'Current cancer treatment (tamoxifen, aromatase inhibitor)', 'single',
               options=_opts(('none', 'None'), ('tamoxifen', 'Tamoxifen'),
                             ('aromatase_inhibitor', 'Aromatase inhibitor'),
                             (DISCUSS, 'Prefer to discuss with the doctor')),
               required=True, flag=['tamoxifen', 'aromatase_inhibitor', DISCUSS]),
            # B. Caution conditions.
            _yes_no('hs_high_bp', 'High blood pressure', flag=['yes']),
            _yes_no('hs_diabetes', 'Diabetes or prediabetes', flag=['yes']),
            _yes_no('hs_cholesterol', 'High cholesterol', flag=['yes']),
            _q('hs_migraine', 'Migraine (with or without aura)', 'single', options=_opts(
                ('no', 'No'), ('without_aura', 'Without aura'), ('with_aura', 'With aura')),
               rules=['R18'], flag=['with_aura']),
            _yes_no('hs_gallbladder', 'Gallbladder disease', flag=['yes']),
            _q('smoking', 'Smoker / vaper', 'single', options=_opts(
                ('never', 'Never'), ('ex', 'Ex'), ('current', 'Current')), rules=['R19'], flag=['current']),
        ]),
    },
    {
        'id': 'other_history', 'title': 'Other history', 'kinds': ['full'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': _carry([
            _q('other_conditions', 'Thyroid disease, PCOS, autoimmune or inflammatory disease', 'multi',
               options=_opts(('thyroid', 'Thyroid disease'), ('pcos', 'PCOS'),
                             ('autoimmune', 'Autoimmune or inflammatory disease (rheumatoid, lupus, psoriasis, IBD)'))),
            _yes_no('osteoporosis', 'Osteoporosis, osteopenia or low-trauma fracture'),
            _q('last_dexa_date', 'Date of last DEXA', 'date', show_if={'answer': 'osteoporosis', 'in': ['yes']}),
            _yes_no('sleep_apnoea', 'Sleep apnoea or loud snoring with daytime sleepiness'),
            _q('other_conditions_text', 'Other conditions and operations', 'text', max_length=2000),
        ]),
    },
    {
        # PHQ-2, GAD-2 and the PHQ-9 self-harm item, in their standard public wording.
        'id': 'mood', 'title': 'Mood screen', 'kinds': ['full'], 'addable': False, 'opens_when': ALWAYS,
        'intro': MOOD_INTRO,
        'questions': [
            _q('phq2_interest', 'Little interest or pleasure in doing things', 'single', options=MOOD_SCALE,
               required=True, rules=['R29'], flag=[PREFER_NOT]),
            _q('phq2_down', 'Feeling down, depressed, or hopeless', 'single', options=MOOD_SCALE, required=True,
               rules=['R29'], flag=[PREFER_NOT]),
            _q('gad2_nervous', 'Feeling nervous, anxious or on edge', 'single', options=MOOD_SCALE, required=True,
               rules=['R29'], flag=[PREFER_NOT]),
            _q('gad2_worry', 'Not being able to stop or control worrying', 'single', options=MOOD_SCALE,
               required=True, rules=['R29'], flag=[PREFER_NOT]),
            _q('self_harm', 'Thoughts that you would be better off dead, or of hurting yourself in some way',
               'single', options=MOOD_SCALE, required=True, rules=['R15'], flag=[1, 2, 3, PREFER_NOT]),
        ],
    },
    {
        'id': 'medicines', 'title': 'Medications, supplements, prior hormones and allergies', 'kinds': ['full'],
        'addable': False, 'opens_when': ALWAYS,
        'questions': _carry([
            _q('current_medicines', 'Current medicines', 'rows', max_rows=20, rules=['R32'], fields=[
                {'id': 'name', 'label': 'Name', 'type': 'text', 'max_length': 120, 'required': True},
                {'id': 'dose', 'label': 'Dose', 'type': 'text', 'max_length': 120},
                {'id': 'how_often', 'label': 'How often', 'type': 'text', 'max_length': 120},
                {'id': 'start', 'label': 'Start date', 'type': 'text', 'max_length': 40},
            ]),
            _q('supplements', 'Supplements and herbal products', 'rows', max_rows=20, rules=['R32'], fields=[
                {'id': 'name', 'label': 'Name', 'type': 'text', 'max_length': 120, 'required': True},
            ]),
            _yes_no('antidepressants', 'Antidepressants (SSRI/SNRI)'),
            _yes_no('blood_thinners', 'Blood thinners'),
            # A row with no stop date is a hormone still taken.
            _q('hormones', 'Hormones now or before', 'rows', max_rows=20, fields=[
                {'id': 'product', 'label': 'Product', 'type': 'text', 'max_length': 120, 'required': True},
                {'id': 'route', 'label': 'Route', 'type': 'single', 'options': _opts(
                    ('patch', 'Patch'), ('gel', 'Gel'), ('cream', 'Cream'), ('oral', 'Oral'),
                    ('vaginal', 'Vaginal'), ('pellet', 'Pellet'), ('troche', 'Troche'),
                    ('injection', 'Injection'))},
                {'id': 'dose', 'label': 'Dose', 'type': 'text', 'max_length': 120},
                {'id': 'start', 'label': 'Start', 'type': 'text', 'max_length': 40},
                {'id': 'stop', 'label': 'Stop', 'type': 'text', 'max_length': 40},
                {'id': 'compounded', 'label': 'Compounded', 'type': 'single', 'options': YES_NO},
            ]),
            _q('hrt_effect', 'How did previous HRT work?', 'single', options=_opts(
                ('helped', 'Helped'), ('partly', 'Partly'), ('no_help', 'No help'),
                ('side_effects', 'Side effects (describe)'))),
            _q('hrt_effect_details', 'Side effects (describe)', 'text', max_length=1000,
               show_if={'answer': 'hrt_effect', 'in': ['side_effects']}),
            _q('hrt_stop_reason', 'Why did you stop?', 'text', max_length=1000),
            _q('drug_allergies', 'Drug allergies and reaction', 'rows', max_rows=20, fields=[
                {'id': 'drug', 'label': 'Drug', 'type': 'text', 'max_length': 120, 'required': True},
                {'id': 'reaction', 'label': 'Reaction', 'type': 'text', 'max_length': 200},
            ]),
            _yes_no('peanut_allergy', 'Peanut allergy', rules=['R11'], flag=['yes']),
            _yes_no('progestin_reactions', 'Reactions to progesterone or progestins'),
            _q('progestin_reactions_detail', 'Describe', 'text', max_length=1000,
               show_if={'answer': 'progestin_reactions', 'in': ['yes']}),
        ]),
    },
    {
        'id': 'family', 'title': 'Family history', 'kinds': ['full'], 'addable': False, 'opens_when': ALWAYS,
        'intro': 'First-degree relatives (mother, sister, daughter, father, brother), with age at diagnosis '
                 'where it matters.',
        'questions': [
            _relatives('fh_breast_cancer', 'Breast cancer', with_age=True, rules=['R24'], flag='any'),
            _relatives('fh_ovarian_cancer', 'Ovarian cancer', with_age=True, rules=['R25'], flag='any'),
            _q('fh_brca', 'Known BRCA or other cancer gene', 'single', options=YES_NO_UNSURE, carry_forward=True,
               rules=['R25'], flag=['yes']),
            _relatives('fh_bowel_endometrial_cancer', 'Bowel or endometrial cancer', with_age=True),
            _relatives('fh_vte', 'Blood clots (DVT/PE)', with_age=False, rules=['R26'], flag='any'),
            _relatives('fh_premature_cvd', 'Heart attack or stroke at a young age (men <55, women <65)',
                       with_age=True, rules=['R27'], flag='any'),
            _relatives('fh_osteoporosis', 'Osteoporosis or hip fracture', with_age=False),
            _relatives('fh_early_menopause', 'Early menopause (<45)', with_age=True),
            _relatives('fh_diabetes', 'Diabetes', with_age=False),
            _relatives('fh_dementia', 'Dementia', with_age=False),
        ],
    },
    {
        'id': 'lifestyle', 'title': 'Lifestyle and life events', 'kinds': ['full'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': _carry([
            _q('sleep_hours', 'Hours per night', 'number', min=0, max=24),
            _yes_no('woken_by_sweats', 'Woken by sweats?'),
            _yes_no('snoring', 'Snoring?'),
            _q('activity_days', 'Days per week of 30 min activity', 'scale', min=0, max=7),
            _yes_no('strength_training', 'Any strength training?'),
            _q('diet', 'How would you describe your usual diet?', 'single', options=_opts(
                ('home_cooked', 'Mostly home-cooked'), ('mixed', 'Mixed'),
                ('processed', 'Mostly processed or takeaway'))),
            _q('stress_level', 'How stressed do you feel most days?', 'scale', min=0, max=10),
            _q('support', 'Do you have people you can rely on?', 'single', options=YES_PARTLY_NO),
            _yes_no('caring', 'Caring for parents or children?'),
            _q('alcohol_units', 'Units or drinks per week', 'number', min=0, max=500, rules=['R23']),
            _q('occupation', 'Occupation', 'text', max_length=200),
            _yes_no('shift_work', 'Shift work'),
            _q('life_events', 'Has anything big happened around the time your symptoms started (loss, illness, '
                              'job change, divorce)?', 'text', max_length=2000),
        ]),
    },
    {
        'id': 'sexual', 'title': 'Sexual health and genitourinary symptoms', 'kinds': ['full'], 'addable': False,
        'opens_when': ALWAYS,
        'intro': 'Many women at midlife have sexual or vaginal concerns. Please tick any that apply to you.',
        'questions': [
            _q('discuss_in_person', 'Prefer to discuss in person', 'tick'),
        ],
    },
    {
        'id': 'sexual_detail', 'title': 'Sexual health and genitourinary symptoms', 'kinds': ['full'],
        'addable': True,
        'opens_when': {'answer': 'discuss_in_person', 'not_in': [True]},
        'questions': [
            _yes_no('low_desire', 'Low desire or interest in sex'),
            _q('desire_bother', 'If yes: does it bother you?', 'single', options=_opts(
                ('not_at_all', 'Not at all'), ('a_little', 'A little'), ('a_lot', 'A lot')),
               rules=['R31'], flag=['a_lot'], show_if={'answer': 'low_desire', 'in': ['yes']}),
            _yes_no('arousal_difficulty', 'Difficulty with arousal'),
            _yes_no('orgasm_difficulty', 'Difficulty reaching orgasm'),
            _yes_no('sex_pain', 'Pain with sex'),
            _q('which_first', 'Which came first?', 'single', options=_opts(
                ('desire', 'Desire'), ('arousal', 'Arousal'), ('orgasm', 'Orgasm'), ('pain', 'Pain'),
                ('not_sure', 'Not sure'))),
            _yes_no('vaginal_dryness', 'Vaginal dryness, itch or burning'),
            _q('urinary_symptoms', 'Urinary urgency, frequency or leaking', 'single', options=_opts(
                ('none', 'None'), ('urgency', 'Urgency'), ('stress_leak', 'Stress leak'), ('both', 'Both'))),
            # Asked once: here, or in the urinary module when this detail is hidden.
            _q('utis_last_year', 'Urine infections in the last year', 'number', min=0, max=100, rules=['R33'],
               also_in=['uri']),
            _yes_no('prolapse_feeling', 'Prolapse feeling (bulge, dragging)', also_in=['uri']),
            _q('sexually_active', 'Currently sexually active', 'single', options=_opts(
                ('yes', 'Yes'), ('no', 'No'), (PREFER_NOT, 'Prefer not to say'))),
        ],
    },
    # --- 10b gynae problem modules, each opened by its reason ------------------------------------
    {
        'id': 'heavy', 'title': 'Heavy or irregular bleeding', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['heavy']},
        'questions': [
            _q('bleed_days', 'Days of bleeding', 'number', min=0, max=60, rules=['R12']),
            _yes_no('flooding_clots', 'Flooding or clots'),
            _q('pad_changes', 'Pad/tampon changes per day', 'number', min=0, max=100),
            _q('days_off_work', 'Days off work', 'number', min=0, max=60),
            _yes_no('tired_breathless', 'Tiredness or breathlessness'),
        ],
    },
    {
        # The doc also opens it from section 3 (bleeding between periods, after sex or after menopause).
        'id': 'bleed', 'title': 'Bleeding between periods, after sex or after menopause', 'kinds': ['full'],
        'addable': True,
        'opens_when': {'any': [{'answer': 'reasons', 'in': ['bleed']},
                               {'answer': 'intermenstrual', 'in': ['yes']},
                               {'answer': 'bleed_after_year', 'in': ['yes']}]},
        'questions': [
            _q('bleed_when', 'When it happens', 'text', max_length=500),
            _q('bleed_how_long', 'How long', 'text', max_length=200),
        ],
    },
    {
        'id': 'pain', 'title': 'Pelvic or period pain', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['pain']},
        'questions': [
            _q('pain_score', 'Pain 0-10 for period pain', 'scale', min=0, max=10, rules=['R12', 'R13']),
            _q('pain_between_score', 'Pain between periods', 'scale', min=0, max=10),
            _q('pain_sex_score', 'Pain with sex', 'scale', min=0, max=10),
            _yes_no('pain_bowel_bladder', 'Pain with bowel or bladder during periods'),
            _yes_no('pain_fever', 'Fever or discharge', rules=['R13'], flag=['yes']),
        ],
    },
    {
        'id': 'contra', 'title': 'Contraception', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['contra']},
        'questions': [
            _q('contraception_wanted', 'Method wanted', 'single', options=CONTRACEPTION),
            _q('future_pregnancy', 'Future pregnancy plans', 'text', max_length=500),
            _yes_no('unprotected_sex_5_days', 'Unprotected sex in the last 5 days', flag=['yes']),
        ],
    },
    {
        'id': 'ttc', 'title': 'Trying to conceive', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['ttc']},
        'questions': [
            _q('ttc_months', 'How long trying (months)', 'number', min=0, max=240),
            _yes_no('partner_tested', 'Partner tested'),
            _yes_no('folic_acid', 'Folic acid'),
        ],
    },
    {
        'id': 'pcos', 'title': 'PCOS, acne, excess hair', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['pcos']},
        'questions': [
            _q('excess_hair', 'Excess hair (face, chest, abdomen)', 'multi', options=_opts(
                ('face', 'Face'), ('chest', 'Chest'), ('abdomen', 'Abdomen'))),
            _yes_no('acne', 'Acne'),
            _yes_no('scalp_thinning', 'Scalp hair thinning'),
            _yes_no('weight_change', 'Weight change'),
            _yes_no('dark_patches', 'Dark skin patches (acanthosis)'),
        ],
    },
    {
        'id': 'dis', 'title': 'Discharge, infection, STI', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['dis']},
        'questions': [
            _q('discharge_colour_odour', 'Discharge colour/odour', 'text', max_length=500),
            _yes_no('inf_itch', 'Itch'),
            _yes_no('inf_dysuria', 'Pain passing urine'),
            _yes_no('inf_pelvic_pain', 'Pelvic pain', rules=['R13'], flag=['yes']),
            # The doc's PID alert reads "pelvic pain + fever" but the module asks no fever question.
            _yes_no('inf_fever', 'Fever', inferred=True, rules=['R13'], flag=['yes']),
            _yes_no('new_partners', 'New or multiple partners'),
            _yes_no('previous_sti', 'Previous STI'),
            _yes_no('partner_symptoms', 'Partner symptoms'),
        ],
    },
    {
        'id': 'uri', 'title': 'Urinary leak or prolapse', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['uri']},
        'questions': [
            _q('leak_type', 'Leak with cough/sneeze vs urgency', 'single', options=_opts(
                ('cough_sneeze', 'Cough/sneeze'), ('urgency', 'Urgency'), ('both', 'Both'))),
            _q('nocturia', 'Night-time passing urine', 'number', min=0, max=20),
        ],
    },
    {
        'id': 'pms', 'title': 'PMS', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['pms']},
        'questions': [
            _q('pms_symptoms', 'Which symptoms', 'text', max_length=1000),
            _q('pms_days_before', 'How many days before the period', 'number', min=0, max=30),
            _q('pms_effect', 'Effect on work or relationships', 'text', max_length=1000),
        ],
    },
    {
        'id': 'smear', 'title': 'Abnormal smear follow-up', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['smear']},
        'questions': [
            _q('smear_last_result', 'Last result', 'text', max_length=500),
            _q('hpv_status', 'HPV status', 'single', options=_opts(
                ('positive', 'Positive'), ('negative', 'Negative'), ('unsure', 'Not sure'))),
            _q('colposcopy', 'Colposcopy or treatment (dates)', 'text', max_length=1000),
            _q('hpv_vaccine', 'HPV vaccine', 'single', options=YES_NO_UNSURE, also_in=['bleed']),
        ],
    },
    {
        'id': 'breast', 'title': 'Breast concern', 'kinds': ['full'], 'addable': True,
        'opens_when': {'answer': 'reasons', 'in': ['breast']},
        'questions': [
            _q('breast_symptoms', 'Lump, nipple discharge, skin change, pain', 'multi', options=_opts(
                ('lump', 'Lump'), ('discharge', 'Nipple discharge'), ('skin', 'Skin change'),
                ('pain', 'Pain')), rules=['R14'], flag=['lump', 'discharge', 'skin']),
            # "New" and "bloody" are read from the R14 alert ("new lump, bloody nipple discharge").
            _q('breast_lump_new', 'New lump', 'single', options=YES_NO_UNSURE, inferred=True, rules=['R14'],
               flag=['yes', 'unsure'], show_if={'answer': 'breast_symptoms', 'in': ['lump']}),
            _q('breast_discharge_bloody', 'Bloody nipple discharge', 'single', options=YES_NO_UNSURE,
               inferred=True, rules=['R14'], flag=['yes', 'unsure'],
               show_if={'answer': 'breast_symptoms', 'in': ['discharge']}),
            _q('breast_pain_cyclical', 'Pain (cyclical or not)', 'single', options=_opts(
                ('cyclical', 'Cyclical'), ('not_cyclical', 'Not cyclical')),
               show_if={'answer': 'breast_symptoms', 'in': ['pain']}),
        ],
    },
    # --- Follow-up form (section 12, patient part) -------------------------------------------------
    {
        'id': 'followup', 'title': 'Follow-up visit form', 'kinds': ['followup'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': [
            _q('overall', 'Overall, since last visit I am', 'single', options=_opts(
                ('much', 'Much better'), ('better', 'Better'), ('same', 'Same'), ('worse', 'Worse')),
               required=True),
            _q('adherence', 'Using my treatment as prescribed', 'single', options=_opts(
                ('yes', 'Yes'), ('some', 'Sometimes'), ('stop', 'Stopped')), required=True),
            _q('adherence_reason', 'Why did you stop?', 'text', max_length=500,
               show_if={'answer': 'adherence', 'in': ['some', 'stop']}),
            _q('side_effects', 'Side effects', 'multi', options=_opts(
                ('breast', 'Breast tenderness'), ('bloat', 'Bloating'), ('head', 'Headache'),
                ('sleepy', 'Drowsiness'), ('mood', 'Low mood'), ('acne', 'Acne'), ('hair', 'Hair thinning'),
                ('facial', 'Facial hair'))),
            _yes_no('bleeding', 'Any bleeding or spotting'),
            _q('medicines', 'Current medicines', 'rows', max_rows=20, fields=[
                {'id': 'name', 'label': 'Name', 'type': 'text', 'max_length': 120, 'required': True},
                {'id': 'still_taking', 'label': 'Still taking', 'type': 'tick', 'default': True},
            ]),
        ],
    },
    {
        'id': 'notes', 'title': 'Anything else', 'kinds': ['full', 'followup'], 'addable': False,
        'opens_when': ALWAYS,
        'questions': [_q('notes', 'Anything else', 'text', max_length=2000)],
    },
]

QUESTIONS: dict[str, dict] = {q['id']: q for s in SECTIONS for q in s['questions']}
SECTION_OF: dict[str, str] = {q['id']: s['id'] for s in SECTIONS for q in s['questions']}
SECTIONS_BY_ID: dict[str, dict] = {s['id']: s for s in SECTIONS}
ADDABLE_MODULES: list[str] = [s['id'] for s in SECTIONS if s['addable']]


def is_blank(value) -> bool:
    return value is None or value == '' or value == [] or value == {}


# The medicine list each form kind prefills from the clinic's records (product.medicines).
PREFILLED_LISTS = {'full': 'current_medicines', 'followup': 'medicines'}


def is_prefilled(question: dict | None) -> bool:
    """
    Whether the form opens this question already filled in (carry-forward answers and the medicine
    lists). Left blank on a form that showed it, it was emptied by the patient: an explicit empty answer.
    """
    return bool(question) and (question['carry_forward'] or question['id'] in PREFILLED_LISTS.values())


def holds(condition: dict, answers: dict, age: int | None, modules: set[str]) -> bool:
    """Whether a catalogue condition holds for these answers, age and open sections."""
    if 'always' in condition:
        return bool(condition['always'])
    if 'all' in condition:
        return all(holds(c, answers, age, modules) for c in condition['all'])
    if 'any' in condition:
        return any(holds(c, answers, age, modules) for c in condition['any'])
    if 'not' in condition:
        return not holds(condition['not'], answers, age, modules)
    if 'module' in condition:
        return condition['module'] in modules
    if 'age_gte' in condition:
        return age is not None and age >= condition['age_gte']
    if 'answered' in condition:
        return not is_blank(answers.get(condition['answered']))
    if 'answer' in condition:
        value = answers.get(condition['answer'])
        wanted = condition['in'] if 'in' in condition else condition['not_in']
        values = value if isinstance(value, list) else [value]
        found = any(v in wanted for v in values if v is not None)
        return found if 'in' in condition else not found
    raise ValueError(f'Unknown catalogue condition: {condition!r}')


def sections_for(kind: str = 'full') -> list[dict]:
    return [s for s in SECTIONS if kind in s['kinds']]


def modules_for(answers: dict, age: int | None, extra_modules, kind: str = 'full') -> set[str]:
    """The ids of the sections that open for these answers, the patient's age and the added modules."""
    added = set(extra_modules or ())
    answers = answers or {}
    opened: set[str] = set()
    for section in sections_for(kind):
        if (section['addable'] and section['id'] in added) or holds(section['opens_when'], answers, age, opened):
            opened.add(section['id'])
    return opened


def placement(question: dict, modules: set[str]) -> str | None:
    """The open section the question is asked in, or None when none of its sections is open."""
    for section_id in [SECTION_OF[question['id']], *question.get('also_in', [])]:
        if section_id in modules:
            return section_id
    return None


def visible_questions(answers: dict, age: int | None, extra_modules, kind: str = 'full') -> set[str]:
    """The ids of the questions shown for these answers: those in open sections whose show_if holds."""
    answers = answers or {}
    modules = modules_for(answers, age, extra_modules, kind)
    shown = set()
    for section in sections_for(kind):
        for question in section['questions']:
            if placement(question, modules) is None:
                continue
            if 'show_if' in question and not holds(question['show_if'], answers, age, modules):
                continue
            shown.add(question['id'])
    return shown


def missing_required(answers: dict, age: int | None, extra_modules, kind: str = 'full') -> list[str]:
    """Shown, required questions left blank, in catalogue order."""
    answers = answers or {}
    modules = modules_for(answers, age, extra_modules, kind)
    shown = visible_questions(answers, age, extra_modules, kind)
    missing = []
    for section in sections_for(kind):
        for question in section['questions']:
            required = question.get('required', False)
            if question['id'] not in shown or not required or question['type'] == 'mrs':
                continue
            if required is True or holds(required, answers, age, modules):
                if is_blank(answers.get(question['id'])):
                    missing.append(question['id'])
    return missing


# --- Answer validation -----------------------------------------------------------------------------

class AnswerError(ValueError):
    pass


def _option_values(spec: dict) -> list:
    return [o['value'] for o in spec['options']]


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _clean_value(spec: dict, value):
    """The value checked against one question or row-field spec; raises AnswerError."""
    qtype = spec['type']
    if qtype == 'single':
        if value not in _option_values(spec) or isinstance(value, bool):
            raise AnswerError('Choose one of the options.')
        return value
    if qtype == 'multi':
        if not isinstance(value, list) or any(v not in _option_values(spec) for v in value):
            raise AnswerError('Choose from the options.')
        return list(dict.fromkeys(value))
    if qtype in ('number', 'scale'):
        if qtype == 'number' and spec.get('not_sure') and value == NOT_SURE:
            return value
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if not _is_int(value):
            raise AnswerError('Enter a whole number.')
        low, high = spec.get('min'), spec.get('max')
        if (low is not None and value < low) or (high is not None and value > high):
            raise AnswerError(f'Enter a number from {low} to {high}.')
        return value
    if qtype == 'text':
        if not isinstance(value, str):
            raise AnswerError('Enter text.')
        value = value.strip()
        if len(value) > spec.get('max_length', 500):
            raise AnswerError(f'Keep this to {spec.get("max_length", 500)} characters.')
        return value
    if qtype == 'date':
        from datetime import date

        # Exactly YYYY-MM-DD: fromisoformat alone also takes "20251011" and week dates ("2025-W41-6").
        try:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError(value)
            date.fromisoformat(value)
        except (TypeError, ValueError):
            raise AnswerError('Enter a date as YYYY-MM-DD.')
        return value
    if qtype == 'tick':
        if not isinstance(value, bool):
            raise AnswerError('Tick or untick.')
        return value
    if qtype == 'rows':
        if not isinstance(value, list) or len(value) > spec.get('max_rows', 20):
            raise AnswerError(f'Add at most {spec.get("max_rows", 20)} rows.')
        rows = []
        for row in value:
            if not isinstance(row, dict):
                raise AnswerError('Each row must be an object.')
            clean = {}
            for field in spec['fields']:
                item = row.get(field['id'], field.get('default'))
                if item is not None:
                    item = _clean_value(field, item)
                if not is_blank(item):
                    clean[field['id']] = item
            if not clean or all(k in {f['id'] for f in spec['fields'] if 'default' in f} for k in clean):
                continue  # an empty row
            for field in spec['fields']:
                if field.get('required') and field['id'] not in clean:
                    raise AnswerError(f'Each row needs the {field["label"].lower()}.')
            rows.append(clean)
        return rows
    raise AnswerError('This question is not answered on the form.')


def clean_answers(answers, kind: str = 'full') -> dict:
    """
    The answers checked against the catalogue: unknown keys (and the MRS, stored apart) are dropped,
    blanks are dropped, and each value's type and options are checked. A blank answer to a prefilled
    question (is_prefilled) is kept as None: she emptied it, and the form must not fill it in again.
    Raises AnswerError with `.fields` ({question id: [message]}) when any value is invalid.
    """
    if not isinstance(answers, dict):
        error = AnswerError('Answers must be an object.')
        error.fields = {}
        raise error
    known = {q['id']: q for s in sections_for(kind) for q in s['questions'] if q['type'] != 'mrs'}
    clean, errors = {}, {}
    for qid, value in answers.items():
        spec = known.get(qid)
        if spec is None:
            continue
        if not is_blank(value):
            try:
                value = _clean_value(spec, value)
            except AnswerError as exc:
                errors[qid] = [str(exc)]
                continue
        if not is_blank(value):
            clean[qid] = value
        elif is_prefilled(spec):
            clean[qid] = None
    if errors:
        error = AnswerError('Some answers are not valid.')
        error.fields = errors
        raise error
    return clean
