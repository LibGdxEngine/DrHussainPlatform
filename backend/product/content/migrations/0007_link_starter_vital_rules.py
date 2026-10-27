"""
Link the starter vitals rules (R20 blood pressure, R21 BMI, R22 waist) to the examination screen,
for clinics whose rules were loaded before examinations were recorded. A new version is added;
earlier versions are never edited. Rules the clinic has reworded are left alone.
"""
from django.db import migrations

LINKS = {
    'R20': ('Blood pressure, average (11)', 'blood_pressure', 'gte'),
    'R21': ('BMI (11)', 'bmi', 'gte'),
    'R22': ('Waist (11)', 'waist', 'gt'),
}
COPIED = ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled')


def link(apps, schema_editor):
    AlertRule = apps.get_model('content', 'AlertRule')
    AlertRuleVersion = apps.get_model('content', 'AlertRuleVersion')
    for rule in AlertRule.objects.filter(code__in=LINKS):
        current = AlertRuleVersion.objects.filter(rule=rule).order_by('-number').first()
        field, vital, check = LINKS[rule.code]
        if current is None or current.vital or current.lab_check or current.field != field:
            continue
        AlertRuleVersion.objects.create(
            rule=rule, number=current.number + 1, vital=vital, lab_check=check,
            note='Checked against examinations', created_by=None,
            **{name: getattr(current, name) for name in COPIED},
        )


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0006_alertruleversion_vital'),
    ]

    operations = [
        migrations.RunPython(link, migrations.RunPython.noop),
    ]
