from django.core.management.base import BaseCommand

from product.records.models import Document
from product.results.pipeline import REPORT_SLOTS
from product.results.tasks import read_report


class Command(BaseCommand):
    help = 'Queue every lab result and pathology file that has never been read into results.'

    def handle(self, *args, **options):
        unread = Document.objects.filter(slot__in=REPORT_SLOTS, report__isnull=True).values_list('pk', flat=True)
        count = 0
        for pk in unread.iterator():
            read_report.delay(str(pk))
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Queued {count} file(s) to be read.'))
