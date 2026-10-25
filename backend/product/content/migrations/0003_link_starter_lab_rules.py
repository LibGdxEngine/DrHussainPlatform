"""
Link the starter lab rules (R34 testosterone, R39 Lp(a)) to the results they check, for clinics
whose rules were loaded before rules could be checked against results. A new version is added;
earlier versions are never edited. Rules the clinic has reworded are left alone.
"""
from django.db import migrations

LINKS = {
    'R34': ('Total testosterone (labs)', 'testosterone_total', 'gt'),
    'R39': ('Lp(a) (labs)', 'lpa', 'never_measured'),
}
COPIED = ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled')


def link(apps, schema_editor):
    AlertRule = apps.get_model('content', 'AlertRule')
    AlertRuleVersion = apps.get_model('content', 'AlertRuleVersion')
    for rule in AlertRule.objects.filter(code__in=LINKS):
        current = AlertRuleVersion.objects.filter(rule=rule).order_by('-number').first()
        field, code, check = LINKS[rule.code]
        if current is None or current.lab_check or current.field != field:
            continue
        AlertRuleVersion.objects.create(
            rule=rule, number=current.number + 1, lab_test_code=code, lab_check=check,
            note='Checked against lab results', created_by=None,
            **{name: getattr(current, name) for name in COPIED},
        )


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0002_alertruleversion_lab_check_and_more'),
    ]

    operations = [
        migrations.RunPython(link, migrations.RunPython.noop),
    ]
