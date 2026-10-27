"""One unreadable email, or a big first sync, must not stop the clinic's mailbox from being read."""
from unittest.mock import patch

from product.mail import services
from product.mail.models import MailMessage, Mailbox
from product.mail.tasks import poll_mailbox, send_thread_reply

from .test_mail import FakeImap, MailTestCase, raw_email


class PollingResilienceTests(MailTestCase):
    def test_a_poison_message_is_skipped_and_the_cursor_moves_past_it(self):
        server = FakeImap({1: raw_email(sender='a@example.com', subject='One'),
                           2: raw_email(sender='b@example.com', subject='Two'),
                           3: raw_email(sender='c@example.com', subject='Three')})
        real_ingest = services.ingest

        def ingest(organization, raw, *, imap_uid=None):
            if imap_uid == 2:
                raise ValueError('unparseable')
            return real_ingest(organization, raw, imap_uid=imap_uid)

        with patch('product.mail.services.imap_connection', return_value=server), \
                patch('product.mail.services.ingest', side_effect=ingest):
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 2)
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.last_uid, 3)
        self.assertIn('UID 2', self.mailbox.last_error)
        self.assertEqual(sorted(MailMessage.objects.values_list('subject', flat=True)), ['One', 'Three'])
        # The next clean poll clears the note.
        with patch('product.mail.services.imap_connection', return_value=server):
            poll_mailbox.apply(args=[str(self.mailbox.id)])
        self.assertEqual(Mailbox.objects.get().last_error, '')

    def test_progress_is_kept_when_the_poll_dies_part_way(self):
        server = FakeImap({1: raw_email(sender='a@example.com', subject='One'),
                           2: raw_email(sender='b@example.com', subject='Two')})
        original_uid = server.uid

        def uid(command, *args):
            if command == 'FETCH' and args[0] == '2':
                raise TimeoutError('soft time limit')
            return original_uid(command, *args)

        server.uid = uid
        with patch('product.mail.services.imap_connection', return_value=server):
            poll_mailbox.apply(args=[str(self.mailbox.id)])
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.last_uid, 1)  # message 1 is not read twice on the next beat
        self.assertIn('TimeoutError', self.mailbox.last_error)

    def test_a_large_first_sync_is_read_in_batches(self):
        server = FakeImap({n: raw_email(sender=f'p{n}@example.com', subject=f'Mail {n}') for n in range(1, 6)})
        with patch('product.mail.services.imap_connection', return_value=server), \
                patch.object(services, 'MAX_MESSAGES_PER_POLL', 2):
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 2)
            self.assertEqual(Mailbox.objects.get().last_uid, 2)
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 2)
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 1)
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 0)
        self.assertEqual(MailMessage.objects.count(), 5)


class ReplyFailureTests(MailTestCase):
    def test_a_reply_whose_retries_ran_out_is_marked_failed(self):
        message = services.ingest(self.clinic, raw_email(sender='laila@example.com', subject='Question'))
        reply = MailMessage.objects.create(
            organization=self.clinic, thread=message.thread, direction=MailMessage.Direction.OUTBOUND,
            status=MailMessage.Status.QUEUED, message_id='<reply@vclinic.test>', from_address='clinic@vclinic.test',
            to_addresses=['laila@example.com'], subject='Re: Question', body_text='Answer', sent_at=message.sent_at,
        )
        send_thread_reply.push_request(id='task-2', retries=5)
        try:
            send_thread_reply.on_failure(ConnectionRefusedError('smtp down'), 'task-2', [str(reply.id)], {}, None)
        finally:
            send_thread_reply.pop_request()
        reply.refresh_from_db()
        self.assertEqual((reply.status, reply.error), (MailMessage.Status.FAILED, 'ConnectionRefusedError'))


class AttachmentDownloadTests(MailTestCase):
    def test_emailed_attachments_are_always_downloads(self):
        html = b'<html><script>alert(1)</script></html>'
        message = services.ingest(self.clinic, raw_email(sender='laila@example.com',
                                                         attachments=[('page.html', html, 'text/html')]))
        [attachment] = message.attachments.all()
        response = self.client.get(f'/api/product/mail/attachments/{attachment.id}/file/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response['Content-Disposition'].startswith('attachment;'), response['Content-Disposition'])
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
