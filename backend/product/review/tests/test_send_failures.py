"""A results email that cannot be delivered goes back to the doctor; the case never sticks in SENDING."""
import smtplib
from unittest.mock import patch

from celery.exceptions import Retry
from django.core import mail

from apps.common.models import FailedTask
from apps.common.tasks import RETRYABLE_EXCEPTIONS
from apps.notifications.tasks.email import EMAIL_RETRYABLE_EXCEPTIONS
from product.results.tests import pdfs
from product.review.models import ResultsCase, SentEmail
from product.review.services import approve_and_send
from product.review.tasks import send_case_email

from .test_review import BASE, ReviewTestCase


class SendFailureTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}\n{{prescription}}')
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        body = self.detail(self.case)['draft']['body'].replace('[[prescription]]', '')
        self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': body}, format='json')
        with patch('product.review.tasks.send_case_email.delay'), self.captureOnCommitCallbacks(execute=True):
            self.sent = approve_and_send(self.case, user=self.doctor)

    def test_permanent_smtp_errors_are_not_retried(self):
        """smtplib errors are OSErrors, but a bad password or refused recipient never succeeds on retry."""
        for permanent in (smtplib.SMTPAuthenticationError(535, b'bad password'),
                          smtplib.SMTPRecipientsRefused({'laila@example.com': (550, b'no such user')}),
                          smtplib.SMTPDataError(552, b'too big'), PermissionError('private_media')):
            with self.subTest(error=type(permanent).__name__):
                self.assertFalse(isinstance(permanent, RETRYABLE_EXCEPTIONS))
                self.assertFalse(isinstance(permanent, EMAIL_RETRYABLE_EXCEPTIONS))
        for transient in (ConnectionRefusedError(), TimeoutError(), smtplib.SMTPServerDisconnected(),
                          smtplib.SMTPConnectError(421, b'busy')):
            with self.subTest(error=type(transient).__name__):
                self.assertTrue(isinstance(transient, EMAIL_RETRYABLE_EXCEPTIONS))

    def test_a_refused_password_returns_the_case_to_the_doctor(self):
        with patch('django.core.mail.EmailMessage.send', side_effect=smtplib.SMTPAuthenticationError(535, b'no')):
            send_case_email.apply(args=[str(self.sent.id)])
        self.sent.refresh_from_db()
        self.case.refresh_from_db()
        self.assertEqual((self.sent.status, self.sent.error), (SentEmail.Status.FAILED, 'SMTPAuthenticationError'))
        self.assertEqual(self.case.status, ResultsCase.Status.DRAFTED)
        self.assertEqual(self.case.actions.order_by('-created_at').first().action, 'send_failed')
        self.assertEqual(mail.outbox, [])

    def test_exhausted_retries_also_return_the_case_to_the_doctor(self):
        """on_failure runs when autoretry gives up; the case must not stay 'Approved, sending' forever."""
        send_case_email.push_request(id='task-1', retries=5)
        try:
            send_case_email.on_failure(ConnectionRefusedError('smtp down'), 'task-1', [str(self.sent.id)], {}, None)
        finally:
            send_case_email.pop_request()
        self.sent.refresh_from_db()
        self.case.refresh_from_db()
        self.assertEqual(self.sent.status, SentEmail.Status.FAILED)
        self.assertEqual(self.case.status, ResultsCase.Status.DRAFTED)
        self.assertEqual(FailedTask.objects.filter(task_name='product.review.tasks.send_case_email').count(), 1)

    def test_the_message_id_is_fixed_before_sending_so_a_retry_cannot_mint_a_second_one(self):
        # A connection fault is retried (eager mode surfaces that as Celery's Retry signal).
        with patch('django.core.mail.EmailMessage.send', side_effect=ConnectionRefusedError('first try')):
            with self.assertRaises(Retry):
                send_case_email.apply(args=[str(self.sent.id)], throw=True)
        self.sent.refresh_from_db()
        self.assertTrue(self.sent.message_id.startswith('<'))
        self.assertEqual(self.sent.status, SentEmail.Status.QUEUED)
        first_id = self.sent.message_id
        send_case_email.apply(args=[str(self.sent.id)])
        self.sent.refresh_from_db()
        self.assertEqual((self.sent.status, self.sent.message_id), (SentEmail.Status.SENT, first_id))
        self.assertEqual(mail.outbox[0].extra_headers['Message-ID'], first_id)
