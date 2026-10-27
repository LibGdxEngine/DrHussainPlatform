"""
What a clinic gets when it is created: the starting test catalog and the starter content. Loaded
once, here, rather than as a side effect of reading the catalog.
"""
from django.db.models.signals import post_save


def onboard_clinic(organization) -> None:
    from product.content.starter import ensure_starter_content
    from product.results.catalog import ensure_catalog

    ensure_catalog(organization)
    ensure_starter_content(organization)


def _organization_saved(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        onboard_clinic(instance)


def connect() -> None:
    from apps.organizations.models import Organization

    post_save.connect(_organization_saved, sender=Organization, dispatch_uid='product.onboarding.organization')
