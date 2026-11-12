"""Shared fixtures for product app tests."""
import shutil
import tempfile
from itertools import count

from apps.accounts.models import User
from apps.organizations.models import OrganizationMember
from product.records.models import Document
from product.storage import EncryptedFileSystemStorage

_phones = count(1)


def make_user(email: str) -> User:
    return User.objects.create_user(email=email, phone=f'+2010{next(_phones):08d}', password='StrongPassword123!')


def make_member(organization, email: str, role=OrganizationMember.Role.MEMBER) -> User:
    user = make_user(email)
    OrganizationMember.objects.create(organization=organization, user=user, role=role)
    return user


def seed_phrases(organization, languages=('en',)) -> dict:
    """
    Give the clinic an approved version of every system phrase in each language; returns
    {(key, language): version}. English uses the starter text (phrase.signature has none, so it is
    skipped there). Other languages get obviously fake text with the same placeholders, translated
    from the English version. Existing approved versions are reused.
    """
    from django.utils import timezone

    from product.content.models import EmailTemplate, EmailTemplateVersion, TemplateKind
    from product.content.starter import STARTER_PHRASES

    seeded = {}
    for position, (key, (name, text, slots)) in enumerate(STARTER_PHRASES.items(), start=1):
        for language in sorted(languages, key=lambda code: code != 'en'):
            existing = EmailTemplate.objects.filter(organization=organization, key=key, language=language).first()
            if existing is not None and existing.approved is not None:
                seeded[(key, language)] = existing.approved
                continue
            english = EmailTemplate.objects.filter(organization=organization, key=key, language='en').first()
            source = seeded.get((key, 'en')) or (english.approved if english else None)
            if language == 'en':
                body = text
            else:
                # Not real Arabic (guardrail G1): a marker with the placeholders kept, and no Latin letters.
                body = ' '.join([f'§{position}', *(f'{{{{{slot}}}}}' for slot in slots)])
            if body is None or (language != 'en' and source is None):
                continue
            template = existing or EmailTemplate.objects.create(
                organization=organization, key=key, language=language, name=name, kind=TemplateKind.PHRASE,
                sort_order=position * 10,
            )
            latest = template.latest
            seeded[(key, language)] = EmailTemplateVersion.objects.create(
                template=template, number=(latest.number + 1) if latest else 1, body=body,
                approved_at=timezone.now(), translated_from=source if language != 'en' else None,
                note='Test phrase',
            )
    return seeded


class PrivateStorageMixin:
    """Keep uploaded test files in a temporary folder, never in the real private media."""

    def setUp(self):
        super().setUp()
        # File fields resolve their storage once at import, so swap them rather than the setting.
        from product.content.models import LeafletVersion
        from product.mail.models import MailAttachment

        self.storage_dir = tempfile.mkdtemp()
        storage = EncryptedFileSystemStorage(location=self.storage_dir)
        for model in (Document, LeafletVersion, MailAttachment):
            field = model._meta.get_field('file')
            self.addCleanup(setattr, field, 'storage', field.storage)
            field.storage = storage
        self.addCleanup(shutil.rmtree, self.storage_dir, ignore_errors=True)
