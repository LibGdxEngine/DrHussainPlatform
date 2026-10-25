from django.core.management.base import BaseCommand

from product.content.models import LeafletVersion
from product.mail.models import MailAttachment
from product.records.models import Document
from product.storage import EncryptedFileSystemStorage


class Command(BaseCommand):
    help = (
        'Encrypt patient files written before encryption at rest, and move every file to the newest '
        'key after MEDIA_ENCRYPTION_KEYS is rotated. Safe to run more than once.'
    )

    def handle(self, *args, **options):
        changed = unchanged = missing = 0
        for model in (Document, LeafletVersion, MailAttachment):
            for item in model.objects.exclude(file='').iterator():
                storage = item.file.storage
                if not isinstance(storage, EncryptedFileSystemStorage):
                    raise SystemExit(f'{model.__name__} files are not on encrypted storage; check STORAGES["private"].')
                if not storage.exists(item.file.name):
                    missing += 1
                    continue
                if storage.reencrypt(item.file.name):
                    changed += 1
                else:
                    unchanged += 1
        self.stdout.write(self.style.SUCCESS(
            f'Encrypted or re-keyed {changed} file(s); {unchanged} already current; {missing} missing on disk.'
        ))
