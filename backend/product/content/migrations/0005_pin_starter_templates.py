"""
Pin the everyday starter templates to the doctor's home page for clinics whose templates were loaded
before templates could be pinned. Templates the clinic created itself are left unpinned.
"""
from django.db import migrations

PINNED = ('results', 'menopause_results', 'follow_up_comparison', 'sti_opening', 'smear_section_1', 'prescription_reply')


def pin(apps, schema_editor):
    EmailTemplate = apps.get_model('content', 'EmailTemplate')
    EmailTemplate.objects.filter(key__in=PINNED, archived=False).update(pinned=True)


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0004_emailtemplate_pinned'),
    ]

    operations = [
        migrations.RunPython(pin, migrations.RunPython.noop),
    ]
