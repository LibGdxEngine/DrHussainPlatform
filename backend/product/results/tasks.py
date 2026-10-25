import logging

from celery import shared_task

from apps.common.tasks import idempotent

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='product.results.tasks.read_report')
def read_report(self, document_id: str, nonce: str = ''):
    """
    Read an uploaded report into results. Keyed on the document and its content, so a redelivered
    message never reads it twice; a deliberate re-read passes a fresh nonce.
    """
    from product.records.models import Document

    from .pipeline import process_document, should_read

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
        report = process_document(document)
        result = {'report_id': str(report.pk), 'status': report.status}
        guard.record(result)
        return result
