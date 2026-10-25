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
