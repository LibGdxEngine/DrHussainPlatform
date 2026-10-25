"""Encrypt mailbox passwords at rest. Only the mail tasks ever decrypt them."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.MAIL_CREDENTIALS_KEY
    if not key:
        # Development fallback. Production sets MAIL_CREDENTIALS_KEY; a key derived from SECRET_KEY
        # stops working, and passwords must be re-entered, when SECRET_KEY is rotated.
        key = base64.urlsafe_b64encode(hashlib.sha256(f'mail-credentials:{settings.SECRET_KEY}'.encode()).digest())
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ''


def decrypt(token: str) -> str:
    if not token:
        return ''
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        # The key changed since the password was saved; the clinic re-enters it in mailbox settings.
        return ''
