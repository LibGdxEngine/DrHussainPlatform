"""Connections to the clinic's own mail server (SMTP out, IMAP in)."""
import imaplib
import ssl
from email.utils import formataddr

from django.conf import settings
from django.core.mail import get_connection

from .models import Mailbox, Security


class MailboxNotReady(Exception):
    """The clinic has no working mailbox, so nothing can be sent from it."""


def smtp_connection(mailbox: Mailbox):
    return get_connection(
        backend=settings.MAIL_SMTP_BACKEND,
        host=mailbox.smtp_host,
        port=mailbox.smtp_port,
        username=mailbox.smtp_username or None,
        password=mailbox.smtp_password or None,
        use_tls=mailbox.smtp_security == Security.STARTTLS,
        use_ssl=mailbox.smtp_security == Security.SSL,
        timeout=settings.MAIL_TIMEOUT_SECONDS,
        fail_silently=False,
    )


def outgoing(organization):
    """
    The connection and From address for a clinic's email. Patient data goes out through the
    clinic's own server only; the platform's own address is a development fallback.
    """
    mailbox = Mailbox.objects.filter(organization=organization).first()
    if mailbox is not None and mailbox.can_send:
        return smtp_connection(mailbox), formataddr((mailbox.display_name, mailbox.address))
    if settings.MAIL_ALLOW_PLATFORM_FALLBACK:
        return get_connection(), settings.DEFAULT_FROM_EMAIL
    raise MailboxNotReady('Set up the clinic mailbox (Inbox → Mailbox settings) before sending email.')


def can_send(organization) -> bool:
    mailbox = Mailbox.objects.filter(organization=organization).first()
    return (mailbox is not None and mailbox.can_send) or settings.MAIL_ALLOW_PLATFORM_FALLBACK


def imap_connection(mailbox: Mailbox):
    """Open and log in to the clinic's IMAP server; the caller logs out."""
    timeout = settings.MAIL_TIMEOUT_SECONDS
    if mailbox.imap_security == Security.SSL:
        client = imaplib.IMAP4_SSL(mailbox.imap_host, mailbox.imap_port, ssl_context=ssl.create_default_context(),
                                   timeout=timeout)
    else:
        client = imaplib.IMAP4(mailbox.imap_host, mailbox.imap_port, timeout=timeout)
        if mailbox.imap_security == Security.STARTTLS:
            client.starttls(ssl_context=ssl.create_default_context())
    client.login(mailbox.imap_username, mailbox.imap_password)
    return client
