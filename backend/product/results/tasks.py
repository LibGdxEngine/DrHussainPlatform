import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings

from apps.common.tasks import idempotent

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='product.results.tasks.read_report',
             soft_time_limit=settings.RESULTS_READ_SOFT_TIME_LIMIT, time_limit=settings.RESULTS_READ_TIME_LIMIT)
def read_report(self, document_id: str, nonce: str = ''):
    """
    Read an uploaded report into results. Keyed on the document and its content, so a redelivered
    message never reads it twice; a deliberate re-read passes a fresh nonce.

    Routed to the `ocr` queue (CELERY_TASK_ROUTES) with its own time limits: a scanned report can
    take minutes. If even that runs out, the report is marked as failed rather than left pending.
    """
    from product.records.models import Document

    from .pipeline import mark_failed, process_document, should_read

    try:
        document = Document.objects.select_related('organization', 'patient').get(pk=document_id)
    except Document.DoesNotExist:
        logger.error('Document %s does not exist. Aborting report reading.', document_id)
        return None
    if not should_read(document):
        return None

    key = self.idempotency_key(document_id, document.sha256, nonce)
    with idempotent(key, task_name=self.name, task_id=self.request.id) as guard:
        if guard.is_duplicate:
            return guard.result
        try:
            report = process_document(document)
        except SoftTimeLimitExceeded:
            logger.warning('Reading document %s ran out of time; marked as failed', document_id)
            report = mark_failed(document, 'read_timed_out')
        # Open the review case: a draft, or a flag for the doctor. Nothing is sent from here.
        from product.review.services import route_report

        case = route_report(report)
        result = {'report_id': str(report.pk), 'status': report.status,
                  'case_status': case.status if case else None}
        guard.record(result)
        return result
