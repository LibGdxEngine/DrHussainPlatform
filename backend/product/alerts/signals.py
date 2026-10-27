"""A changed lab rule is applied to existing patients, not only to the next result that comes in."""
import logging

from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_save

logger = logging.getLogger(__name__)

# A bulk save adds one version per changed rule in one transaction; one sweep covers them all.
COALESCE_SECONDS = 5


def _rule_version_saved(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    from .models import PatientAlert

    affects_results = bool(instance.lab_check) or PatientAlert.objects.filter(
        rule_id=instance.rule_id, status=PatientAlert.Status.OPEN,
    ).exists()
    if not affects_results:
        return
    from product.patients.models import Patient

    organization_id = instance.rule.organization_id
    if not Patient.objects.filter(organization_id=organization_id).exists():
        return  # a new clinic's starter rules: nobody to check yet
    transaction.on_commit(lambda: queue_reevaluation(str(organization_id)))


def queue_reevaluation(organization_id: str) -> bool:
    """Queue one sweep of the clinic; repeats within a few seconds fold into it."""
    from .tasks import reevaluate_clinic

    if not cache.add(f'alerts:reevaluate:{organization_id}', 1, COALESCE_SECONDS):
        return False
    try:
        reevaluate_clinic.delay(organization_id)
    except Exception:  # noqa: BLE001 - the rule is saved either way; the sweep is a convenience
        logger.warning('Could not queue the alert re-evaluation for clinic %s', organization_id, exc_info=True)
        cache.delete(f'alerts:reevaluate:{organization_id}')
        return False
    return True


def connect() -> None:
    from product.content.models import AlertRuleVersion

    post_save.connect(_rule_version_saved, sender=AlertRuleVersion, dispatch_uid='product.alerts.rule_version_saved')
