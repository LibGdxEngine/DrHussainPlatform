"""The clinic's test catalog: canonical tests and every lab's name for them."""
import re
import unicodedata
from decimal import Decimal

from django.db import transaction

from apps.organizations.models import Organization

from .models import LabTest, LabTestAlias

NUMERIC = LabTest.Kind.NUMERIC
QUALITATIVE = LabTest.Kind.QUALITATIVE
TEXT = LabTest.Kind.TEXT

# Starting catalog, loaded once per clinic. Clinic settings take over from here; it is not the
# source of truth after the first load. Tracked tests match the key values panel mock-up.
DEFAULT_TESTS = [
    # code, name, kind, unit, optimal (low, high, text), tracked, aliases
    ('ferritin', 'Ferritin', NUMERIC, 'ng/mL', (50, 150, '50–150'), True, ['serum ferritin', 's ferritin']),
    ('estradiol', 'Estradiol', NUMERIC, 'pg/mL', (None, None, 'N/A'), True,
     ['oestradiol', 'e2', 'estradiol e2', 'serum estradiol', '17 beta estradiol']),
    ('testosterone_total', 'Testosterone, total', NUMERIC, 'ng/dL', (None, 50, '<50 on treatment'), True,
     ['testosterone', 'total testosterone', 'serum testosterone']),
    ('hba1c', 'HbA1c', NUMERIC, '%', (None, Decimal('5.4'), '<5.4'), True,
     ['hb a1c', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated hemoglobin', 'a1c']),
    ('ldl', 'LDL', NUMERIC, 'mmol/L', (None, None, 'Per cardiovascular risk'), True,
     ['ldl cholesterol', 'ldl c', 'low density lipoprotein', 'ldl cholesterol calculated']),
    ('tsh', 'TSH', NUMERIC, 'mIU/L', (1, Decimal('2.5'), '1–2.5'), True,
     ['thyroid stimulating hormone', 'tsh 3rd generation', 's tsh']),
    ('fsh', 'FSH', NUMERIC, 'mIU/mL', (None, None, ''), False, ['follicle stimulating hormone', 'serum fsh']),
    ('lh', 'LH', NUMERIC, 'mIU/mL', (None, None, ''), False, ['luteinizing hormone', 'luteinising hormone']),
    ('amh', 'AMH', NUMERIC, 'ng/mL', (None, None, ''), False, ['anti mullerian hormone', 'anti müllerian hormone']),
    ('prolactin', 'Prolactin', NUMERIC, 'ng/mL', (None, None, ''), False, ['serum prolactin', 'prl']),
    ('shbg', 'SHBG', NUMERIC, 'nmol/L', (None, None, ''), False, ['sex hormone binding globulin']),
    ('vitamin_d', 'Vitamin D', NUMERIC, 'ng/mL', (None, None, ''), False,
     ['25 oh vitamin d', '25 hydroxy vitamin d', 'vitamin d total', 'vit d']),
    ('haemoglobin', 'Haemoglobin', NUMERIC, 'g/dL', (None, None, ''), False, ['hemoglobin', 'hb', 'hgb']),
    ('cholesterol_total', 'Total cholesterol', NUMERIC, 'mmol/L', (None, None, ''), False,
     ['cholesterol', 'total cholesterol', 'serum cholesterol']),
    ('hdl', 'HDL', NUMERIC, 'mmol/L', (None, None, ''), False, ['hdl cholesterol', 'hdl c']),
    ('triglycerides', 'Triglycerides', NUMERIC, 'mmol/L', (None, None, ''), False, ['tg', 'triglyceride']),
    ('glucose_fasting', 'Fasting glucose', NUMERIC, 'mmol/L', (None, None, ''), False,
     ['fasting blood sugar', 'fbs', 'fasting plasma glucose', 'glucose fasting']),
    ('free_t4', 'Free T4', NUMERIC, 'pmol/L', (None, None, ''), False, ['ft4', 'free thyroxine']),
    ('chlamydia', 'Chlamydia trachomatis', QUALITATIVE, '', (None, None, ''), False,
     ['chlamydia', 'chlamydia trachomatis pcr', 'c trachomatis']),
    ('gonorrhoea', 'Neisseria gonorrhoeae', QUALITATIVE, '', (None, None, ''), False,
     ['gonorrhoea', 'gonorrhea', 'n gonorrhoeae', 'neisseria gonorrhoeae pcr']),
    ('trichomonas', 'Trichomonas vaginalis', QUALITATIVE, '', (None, None, ''), False,
     ['trichomonas', 't vaginalis', 'trichomonas vaginalis pcr']),
    ('mycoplasma_genitalium', 'Mycoplasma genitalium', QUALITATIVE, '', (None, None, ''), False,
     ['m genitalium', 'mycoplasma genitalium pcr']),
    ('ureaplasma', 'Ureaplasma', QUALITATIVE, '', (None, None, ''), False,
     ['ureaplasma urealyticum', 'ureaplasma species']),
    ('candida', 'Candida', QUALITATIVE, '', (None, None, ''), False,
     ['candida albicans', 'candida species', 'yeast', 'candida spp']),
    ('bacterial_vaginosis', 'Bacterial vaginosis', QUALITATIVE, '', (None, None, ''), False,
     ['bv', 'gardnerella vaginalis', 'gardnerella']),
    ('group_b_strep', 'Group B streptococcus', QUALITATIVE, '', (None, None, ''), False,
     ['gbs', 'streptococcus agalactiae', 'group b strep']),
    ('hpv_high_risk', 'HPV, high risk', QUALITATIVE, '', (None, None, ''), False,
     ['hpv', 'high risk hpv', 'hr hpv', 'hpv dna', 'human papillomavirus']),
    ('herpes', 'Herpes simplex', QUALITATIVE, '', (None, None, ''), False,
     ['hsv', 'hsv 1 2', 'herpes simplex virus', 'hsv pcr']),
    ('syphilis', 'Syphilis', QUALITATIVE, '', (None, None, ''), False,
     ['treponema pallidum', 'tpha', 'vdrl', 'rpr', 'syphilis serology']),
    ('hiv', 'HIV 1/2', QUALITATIVE, '', (None, None, ''), False, ['hiv', 'hiv 1 2 ag ab', 'hiv antibody']),
    ('cervical_cytology', 'Cervical cytology', TEXT, '', (None, None, ''), False,
     ['cervical smear', 'pap smear', 'liquid based cytology', 'lbc', 'cytology result']),
]

_PUNCTUATION = re.compile(r'[^\w%]+')


def normalize_test_name(name: str) -> str:
    """Lower-case and strip punctuation, so 'S. Ferritin:' and 's ferritin' match the same alias."""
    text = unicodedata.normalize('NFKC', name or '').casefold()
    return ' '.join(_PUNCTUATION.sub(' ', text).split())


def ensure_catalog(organization) -> None:
    """Load the starting catalog the first time a clinic needs it; later edits are never overwritten."""
    if LabTest.objects.filter(organization=organization).exists():
        return
    with transaction.atomic():
        # Concurrent first requests would otherwise both load it; lock the clinic and look again.
        Organization.objects.select_for_update().get(pk=organization.pk)
        if not LabTest.objects.filter(organization=organization).exists():
            _load_catalog(organization)


def _load_catalog(organization) -> None:
    for position, (code, name, kind, unit, (low, high, text), tracked, aliases) in enumerate(DEFAULT_TESTS):
        test = LabTest.objects.create(
            organization=organization, code=code, name=name, kind=kind, default_unit=unit,
            optimal_low=low, optimal_high=high, optimal_text=text, tracked=tracked, sort_order=position * 10,
        )
        names = {normalize_test_name(n) for n in [name, code.replace('_', ' '), *aliases]}
        LabTestAlias.objects.bulk_create(
            [LabTestAlias(lab_test=test, organization=organization, alias=n) for n in sorted(names)],
            ignore_conflicts=True,
        )


class Catalog:
    """In-memory alias lookup for one clinic, built once per report."""

    def __init__(self, organization):
        ensure_catalog(organization)
        self.by_alias = {
            alias.alias: alias.lab_test
            for alias in LabTestAlias.objects.filter(organization=organization).select_related('lab_test')
        }

    def resolve(self, raw_name: str) -> LabTest | None:
        name = normalize_test_name(raw_name)
        if name in self.by_alias:
            return self.by_alias[name]
        # Labs append method or specimen: "Ferritin (CLIA)", "TSH, serum".
        trimmed = normalize_test_name(re.split(r'[(,\[]', raw_name, maxsplit=1)[0])
        return self.by_alias.get(trimmed)
