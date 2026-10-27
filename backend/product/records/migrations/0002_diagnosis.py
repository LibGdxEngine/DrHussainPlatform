import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('records', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Diagnosis',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('suspected', 'Suspected'), ('confirmed', 'Confirmed'), ('resolved', 'Resolved'), ('ruled_out', 'Ruled out')], max_length=20)),
                ('noted_on', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('version', models.PositiveIntegerField(default=1)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_diagnoses', to=settings.AUTH_USER_MODEL)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='diagnoses', to='organizations.organization')),
                ('patient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='diagnoses', to='patients.patient')),
            ],
            options={'ordering': ['-updated_at', '-id'], 'indexes': [models.Index(fields=['organization', 'patient'], name='records_diag_org_patient_idx')]},
        ),
        migrations.CreateModel(
            name='DiagnosisRevision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('number', models.PositiveIntegerField()),
                ('name', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('suspected', 'Suspected'), ('confirmed', 'Confirmed'), ('resolved', 'Resolved'), ('ruled_out', 'Ruled out')], max_length=20)),
                ('noted_on', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('author', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='diagnosis_revisions', to=settings.AUTH_USER_MODEL)),
                ('diagnosis', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='revisions', to='records.diagnosis')),
            ],
            options={'ordering': ['-number'], 'constraints': [models.UniqueConstraint(fields=('diagnosis', 'number'), name='records_diagnosis_revision_number')]},
        ),
    ]
