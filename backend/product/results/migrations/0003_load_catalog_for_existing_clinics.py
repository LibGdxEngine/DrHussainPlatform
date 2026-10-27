"""
The starting catalog used to be loaded on the first read of the test list; it is now loaded when a
clinic is created (product.onboarding). Clinics that already exist get it here, once.
"""
from django.db import migrations

from product.results.catalog import DEFAULT_TESTS, normalize_test_name


def load_catalogs(apps, schema_editor):
    Organization = apps.get_model('organizations', 'Organization')
    LabTest = apps.get_model('results', 'LabTest')
    LabTestAlias = apps.get_model('results', 'LabTestAlias')
    for organization in Organization.objects.all():
        existing = set(LabTest.objects.filter(organization=organization).values_list('code', flat=True))
        taken = set(LabTestAlias.objects.filter(organization=organization).values_list('alias', flat=True))
        for position, (code, name, kind, unit, (low, high, text), tracked, aliases) in enumerate(DEFAULT_TESTS):
            if code in existing:
                continue
            test = LabTest.objects.create(
                organization=organization, code=code, name=name, kind=kind, default_unit=unit,
                optimal_low=low, optimal_high=high, optimal_text=text, tracked=tracked, sort_order=position * 10,
            )
            # Names the clinic already gave to another test stay with that test.
            names = {normalize_test_name(n) for n in [name, code.replace('_', ' '), *aliases]} - taken
            taken |= names
            LabTestAlias.objects.bulk_create(
                [LabTestAlias(lab_test=test, organization=organization, alias=n) for n in sorted(names)],
                ignore_conflicts=True,
            )


class Migration(migrations.Migration):
    dependencies = [
        ('organizations', '0002_invitation'),
        ('results', '0002_alter_investigationreport_status'),
    ]

    operations = [
        migrations.RunPython(load_catalogs, migrations.RunPython.noop),
    ]
