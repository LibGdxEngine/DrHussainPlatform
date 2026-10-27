import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='product.alerts.tasks.reevaluate_clinic')
def reevaluate_clinic(organization_id: str) -> int:
    """
    A lab alert rule changed (a new cut-off, switched on or off): every patient in the clinic is
    checked again, so existing results open or clear alerts under the rules as they now stand.
    """
    from apps.organizations.models import Organization

    from .services import evaluate_clinic

    organization = Organization.objects.filter(pk=organization_id).first()
    if organization is None:
        return 0
    count = evaluate_clinic(organization)
    logger.info('Alert rules re-evaluated for %s patients of clinic %s', count, organization_id)
    return count
