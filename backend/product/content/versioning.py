"""Add versions to clinic content. Old versions are never edited or deleted."""
from django.db import transaction

from .models import AlertRuleVersion, EmailTemplateVersion, PrescriptionVersion, ScoreBandVersion

CONTENT_FIELDS = {
    EmailTemplateVersion: ('subject', 'body'),
    PrescriptionVersion: ('drug', 'dose', 'directions'),
    AlertRuleVersion: ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled',
                       'lab_test_code', 'lab_check'),
    ScoreBandVersion: ('bands',),
}


def _parent_field(version_model, parent):
    return next(
        f.name for f in version_model._meta.get_fields()
        if getattr(f, 'many_to_one', False) and f.related_model is type(parent)
    )


@transaction.atomic
def add_version(parent, version_model, data: dict, *, user, note: str = ''):
    """
    Record `data` as the item's next version. Fields left out keep their current value. Returns
    (version, created); nothing is added when the content would not change.
    """
    type(parent).objects.select_for_update().get(pk=parent.pk)
    parent_field = _parent_field(version_model, parent)
    latest = version_model.objects.filter(**{parent_field: parent}).order_by('-number').first()
    fields = CONTENT_FIELDS[version_model]
    values = {}
    for name in fields:
        if name in data:
            values[name] = data[name]
        elif latest is not None:
            values[name] = getattr(latest, name)
    if latest is not None and all(getattr(latest, name) == values[name] for name in fields):
        return latest, False
    version = version_model.objects.create(
        **{parent_field: parent}, number=(latest.number + 1) if latest else 1, note=note[:255], created_by=user,
        **values,
    )
    return version, True
