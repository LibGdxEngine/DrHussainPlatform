"""
Add the English system phrases (`phrase.*` templates, each with one approved version) for clinics
whose starter content was loaded before the phrases existed. The text is the English that was
hard-coded in review/services.py, moved, not reworded. Clinics without starter templates get the
phrases with their starter content. phrase.signature gets no version: drafts use the clinic
profile's signature until the clinic approves one. No Arabic is added.
"""
from django.db import migrations
from django.utils import timezone

# key: (name, English text, moved from code)
PHRASES = {
    'phrase.could_not_be_read': ('Result could not be read', 'could not be read', True),
    'phrase.flag_high': ('Result flag: high', 'high', True),
    'phrase.flag_low': ('Result flag: low', 'low', True),
    'phrase.flag_abnormal': ('Result flag: abnormal', 'abnormal', True),
    'phrase.reference': ('Reference range', 'reference {{range}}', True),
    'phrase.change_higher': ('Change: higher', 'higher', True),
    'phrase.change_lower': ('Change: lower', 'lower', True),
    'phrase.change_unchanged': ('Change: unchanged', 'unchanged', True),
    'phrase.change_changed': ('Change: changed', 'changed', True),
    'phrase.not_compared': ('Not compared', 'measured differently, not compared', True),
    'phrase.all_within_range': ('All results within range', 'All results are within the reference range.', True),
    'phrase.above_range': ('Range: above', 'above the reference range', False),
    'phrase.below_range': ('Range: below', 'below the reference range', False),
    'phrase.back_within_range': ('Range: back within', 'back within the reference range', False),
    'phrase.toward_range': ('Range: closer', 'closer to the reference range', False),
    'phrase.further_from_range': ('Range: further', 'further from the reference range', False),
    'phrase.different_lab': ('Different lab', 'different lab: {{labs}}', False),
    'phrase.follow_up_heading': ('Follow-up heading', 'Follow-up: {{follow_up}}', False),
    'phrase.default_subject': ('Default subject', 'Your results', True),
}


def add_phrases(apps, schema_editor):
    EmailTemplate = apps.get_model('content', 'EmailTemplate')
    EmailTemplateVersion = apps.get_model('content', 'EmailTemplateVersion')
    now = timezone.now()
    clinics = EmailTemplate.objects.exclude(kind='phrase').values_list('organization_id', flat=True).distinct()
    for organization_id in clinics:
        if EmailTemplate.objects.filter(organization_id=organization_id, kind='phrase').exists():
            continue
        for position, (key, (name, text, moved)) in enumerate(PHRASES.items(), start=1):
            template = EmailTemplate.objects.create(organization_id=organization_id, key=key, language='en',
                                                    name=name, kind='phrase', part='full', sort_order=position * 10)
            EmailTemplateVersion.objects.create(
                template=template, number=1, subject='', body=text, approved_at=now, created_by=None,
                note='System phrase moved from code' if moved else 'System phrase',
            )


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0009_link_starter_answer_rules'),
    ]

    operations = [
        migrations.RunPython(add_phrases, migrations.RunPython.noop),
    ]
