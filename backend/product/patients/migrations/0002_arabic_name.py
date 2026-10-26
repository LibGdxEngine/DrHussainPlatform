from django.db import migrations, models


def renormalize(apps, schema_editor):
    """Arabic letter folding changed how names are normalized; recompute stored names."""
    from product.patients.services import normalize_name

    Patient = apps.get_model('patients', 'Patient')
    for patient in Patient.objects.all().iterator():
        patient.normalized_name = normalize_name(patient.full_name)
        patient.normalized_name_ar = normalize_name(patient.full_name_ar)
        patient.save(update_fields=['normalized_name', 'normalized_name_ar'])


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='full_name_ar',
            field=models.CharField(blank=True, default='', max_length=255, verbose_name='Arabic name'),
        ),
        migrations.AddField(
            model_name='patient',
            name='normalized_name_ar',
            field=models.CharField(blank=True, db_index=True, default='', editable=False, max_length=255),
        ),
        migrations.RunPython(renormalize, migrations.RunPython.noop),
    ]
