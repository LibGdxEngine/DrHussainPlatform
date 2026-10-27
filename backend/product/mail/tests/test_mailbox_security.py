"""The mailbox settings must not let a clinic account probe the hosting network or read server internals."""
from unittest.mock import patch

from django.test import override_settings
from rest_framework import status

from product.mail.models import Mailbox
from product.mail.services import quote_folder
from product.mail.tasks import poll_mailbox
from product.mail.transport import MailHostNotAllowed, ensure_allowed

from .test_mail import FakeImap, MailTestCase, raw_email

CHECK = '/api/product/mail/mailbox/check/'
SETTINGS = '/api/product/mail/mailbox/'
BACKSLASH = chr(92)


def _resolved(*addresses):
    """What socket.getaddrinfo returns for a name: one entry per address."""
    return [(2, 1, 6, '', (address, 0)) for address in addresses]


@override_settings(MAIL_ALLOW_PRIVATE_HOSTS=False, DEBUG=False)
class MailboxSecurityTests(MailTestCase):
    def test_plain_text_connections_are_refused_outside_development(self):
        response = self.client.patch(SETTINGS, {'smtp_security': 'none'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('smtp_security', response.data['error']['fields'])
        self.assertEqual(self.client.patch(SETTINGS, {'imap_security': 'none'}, format='json').status_code,
                         status.HTTP_400_BAD_REQUEST)
        with self.assertRaises(MailHostNotAllowed):
            ensure_allowed('imap.vclinic.test', 'none')
        with override_settings(DEBUG=True):
            self.assertEqual(self.client.patch(SETTINGS, {'smtp_security': 'none'}, format='json').status_code,
                             status.HTTP_200_OK)

    def test_private_and_loopback_hosts_are_refused_before_any_connection(self):
        cases = (
            ('127.0.0.1', ['127.0.0.1']), ('metadata.internal', ['169.254.169.254']), ('db.internal', ['10.0.0.5']),
            ('::1', ['::1']), ('mapped.internal', ['::ffff:192.168.1.9']), ('mixed.example', ['8.8.8.8', '10.1.1.1']),
        )
        for host, addresses in cases:
            with self.subTest(host=host), \
                    patch('product.mail.transport.socket.getaddrinfo', return_value=_resolved(*addresses)), \
                    patch('product.mail.transport.imaplib.IMAP4_SSL') as imap, \
                    patch('django.core.mail.backends.base.BaseEmailBackend.open') as smtp:
                Mailbox.objects.filter(pk=self.mailbox.pk).update(smtp_host=host, imap_host=host)
                response = self.client.post(CHECK)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                refused = 'The server address must be a public mail server.'
                self.assertEqual(response.data, {'smtp': refused, 'imap': refused})
                imap.assert_not_called()
                smtp.assert_not_called()
        with patch('product.mail.transport.socket.getaddrinfo', return_value=_resolved('8.8.8.8')):
            ensure_allowed('mail.example.com', 'ssl')  # a public address is fine
        with patch('product.mail.transport.socket.getaddrinfo', return_value=_resolved('10.0.0.5')), \
                override_settings(MAIL_ALLOW_PRIVATE_HOSTS=True):
            ensure_allowed('mailserver', 'starttls')  # the development stack's own mail server

    def test_polling_also_refuses_a_private_host(self):
        Mailbox.objects.filter(pk=self.mailbox.pk).update(imap_host='10.0.0.5')
        with patch('product.mail.transport.imaplib.IMAP4_SSL') as imap:
            self.assertIsNone(poll_mailbox.apply(args=[str(self.mailbox.id)]).get())
        imap.assert_not_called()
        self.assertIn('public mail server', Mailbox.objects.get().last_error)

    def test_check_reports_a_generic_message_not_the_exception(self):
        with patch('product.mail.transport.socket.getaddrinfo', return_value=_resolved('8.8.8.8')), \
                patch('product.mail.transport.imaplib.IMAP4_SSL',
                      side_effect=RuntimeError('banner from 10.0.0.5 build 42 /srv/mail')), \
                patch('django.core.mail.backends.base.BaseEmailBackend.open', side_effect=OSError('/etc/secret')):
            response = self.client.post(CHECK)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['imap'], 'The connection could not be made.')
        self.assertEqual(response.data['smtp'], 'The connection could not be made.')
        self.assertNotIn('10.0.0.5', str(response.data))
        self.assertNotIn('secret', str(response.data))

    def test_imap_folder_is_restricted_to_safe_characters_and_quoted(self):
        bad = self.client.patch(SETTINGS, {'imap_folder': 'INBOX" BAD'}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('imap_folder', bad.data['error']['fields'])
        good = self.client.patch(SETTINGS, {'imap_folder': 'INBOX/Patients [2026]'}, format='json')
        self.assertEqual(good.status_code, status.HTTP_200_OK, good.data)

        self.assertEqual(quote_folder('Patients'), '"Patients"')
        self.assertEqual(quote_folder('A"B' + BACKSLASH), '"A' + BACKSLASH + '"B' + BACKSLASH * 2 + '"')
        with self.assertRaises(ValueError):
            quote_folder('a\nb')

        class RecordingImap(FakeImap):
            def select(self, folder, readonly=False):
                self.selected = folder
                return super().select(folder, readonly)

        server = RecordingImap({1: raw_email(sender='laila@example.com')})
        with patch('product.mail.services.imap_connection', return_value=server), \
                override_settings(MAIL_ALLOW_PRIVATE_HOSTS=True):
            poll_mailbox.apply(args=[str(self.mailbox.id)])
        self.assertEqual(server.selected, '"INBOX/Patients [2026]"')
