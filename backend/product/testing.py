"""Shared fixtures for product app tests."""
import shutil
import tempfile
from itertools import count

from django.core.files.storage import FileSystemStorage

from apps.accounts.models import User
from apps.organizations.models import OrganizationMember
from product.records.models import Document

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
        # The field resolves its storage once at import, so swap it rather than the setting.
        self.storage_dir = tempfile.mkdtemp()
        field = Document._meta.get_field('file')
        original_storage = field.storage
        field.storage = FileSystemStorage(location=self.storage_dir)
        self.addCleanup(setattr, field, 'storage', original_storage)
        self.addCleanup(shutil.rmtree, self.storage_dir, ignore_errors=True)
