"""
Patient files encrypted at rest: uploaded reports, emailed attachments and leaflets.

Files are encrypted with Fernet (AES-128-CBC with HMAC-SHA256) before they reach the disk and
decrypted when the platform opens them. MEDIA_ENCRYPTION_KEYS is a comma-separated list: the
first key encrypts, every key decrypts, so a key can be rotated by adding a new one in front and
re-running `encrypt_private_media`. Files written before encryption was switched on are read as
they are until that command encrypts them.
"""
import base64
import hashlib
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible

MAGIC = b'VCENC1\n'


@lru_cache(maxsize=4)
def _keys(keys: str, secret: str) -> tuple[Fernet, ...]:
    configured = [k.strip() for k in keys.split(',') if k.strip()]
    if not configured:
        # Development fallback only; production sets MEDIA_ENCRYPTION_KEYS (see the data-protection review).
        configured = [base64.urlsafe_b64encode(hashlib.sha256(f'media-at-rest:{secret}'.encode()).digest()).decode()]
    return tuple(Fernet(key) for key in configured)


def fernet() -> MultiFernet:
    """Encrypts with the first key, decrypts with any of them."""
    return MultiFernet(list(_keys(settings.MEDIA_ENCRYPTION_KEYS, settings.SECRET_KEY)))


def primary() -> Fernet:
    return _keys(settings.MEDIA_ENCRYPTION_KEYS, settings.SECRET_KEY)[0]


def encrypt_bytes(data: bytes) -> bytes:
    return MAGIC + fernet().encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    if not data.startswith(MAGIC):
        return data  # written before encryption at rest; `encrypt_private_media` converts it
    return fernet().decrypt(data[len(MAGIC):])


def is_encrypted(data: bytes) -> bool:
    return data.startswith(MAGIC)


@deconstructible
class EncryptedFileSystemStorage(FileSystemStorage):
    """A FileSystemStorage whose files are only ever plaintext in the platform's memory."""

    def _save(self, name, content):
        content.seek(0)
        return super()._save(name, ContentFile(encrypt_bytes(content.read())))

    def _open(self, name, mode='rb'):
        if 'w' in mode or 'a' in mode or '+' in mode:
            raise ValueError('Encrypted files are written through save(), not opened for writing.')
        with super()._open(name, 'rb') as handle:
            data = handle.read()
        return ContentFile(decrypt_bytes(data), name=name)

    def reencrypt(self, name) -> bool:
        """Encrypt a plaintext file, or move an encrypted one to the newest key. True if it changed."""
        with super()._open(name, 'rb') as handle:
            data = handle.read()
        if is_encrypted(data):
            token = data[len(MAGIC):]
            try:
                primary().decrypt(token)
                return False  # already under the newest key
            except InvalidToken:
                new = MAGIC + fernet().rotate(token)
        else:
            new = encrypt_bytes(data)
        path = self.path(name)
        temporary = f'{path}.encrypting'
        with open(temporary, 'wb') as handle:
            handle.write(new)
        os.replace(temporary, path)  # never a half-written file
        return True
