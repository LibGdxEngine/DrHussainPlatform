"""
Default aliases added after clinics' catalogs were loaded. A test name not in the catalog holds the
report for the doctor, so existing clinics get these names too, once: a name the clinic already
gave to a test is left where it is, and a clinic without the test is skipped.
"""
from django.db import migrations

# (test code, normalised alias), frozen as released.
LATER_ALIASES = [
    ('vitamin_d', 'vitamin d 25 oh'),
]


def add_aliases(apps, schema_editor):
    LabTest = apps.get_model('results', 'LabTest')
    LabTestAlias = apps.get_model('results', 'LabTestAlias')
    for code, alias in LATER_ALIASES:
        taken = set(LabTestAlias.objects.filter(alias=alias).values_list('organization_id', flat=True))
        LabTestAlias.objects.bulk_create(
            [LabTestAlias(lab_test=test, organization_id=test.organization_id, alias=alias)
             for test in LabTest.objects.filter(code=code).exclude(organization_id__in=taken)],
            ignore_conflicts=True,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('results', '0004_resultvalue_needs_check'),
    ]

    operations = [
        migrations.RunPython(add_aliases, migrations.RunPython.noop),
    ]
