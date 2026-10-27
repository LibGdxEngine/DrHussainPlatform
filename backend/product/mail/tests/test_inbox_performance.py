"""The inbox list costs the same number of queries however many threads it shows."""
from django.db import connection
from django.test.utils import CaptureQueriesContext

from product.mail import services

from .test_mail import PDF, MailTestCase, raw_email

THREADS = '/api/product/mail/threads/'


class InboxPerformanceTests(MailTestCase):
    received = 0

    def _receive(self, count, *, attachments=()):
        for _ in range(count):
            index = self.received
            self.received += 1
            services.ingest(self.clinic, raw_email(sender=f'patient{index}@example.com', subject=f'Mail {index}',
                                                   body=f'Hello number {index}', attachments=attachments))

    def test_thread_list_query_count_does_not_grow_with_threads(self):
        self._receive(2, attachments=[('scan.pdf', PDF, 'application/pdf')])
        with CaptureQueriesContext(connection) as small:
            self.assertEqual(self.client.get(THREADS).status_code, 200)
        self._receive(5)
        with CaptureQueriesContext(connection) as large:
            response = self.client.get(THREADS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(large), len(small), [q['sql'][:80] for q in large])
        self.assertEqual(response.data['count'], 7)
        by_subject = {t['subject']: t for t in response.data['results']}
        self.assertEqual(by_subject['Mail 0']['preview'], 'Hello number 0')
        self.assertTrue(by_subject['Mail 1']['has_attachments'])
        self.assertFalse(by_subject['Mail 4']['has_attachments'])

    def test_sent_mail_with_named_attachments_shows_the_paper_clip(self):
        self.send_results()
        thread = self.client.get(THREADS, {'folder': 'sent'}).data['results'][0]
        self.assertTrue(thread['has_outbound'])
        self.assertIn('Dear', thread['preview'])
        detail = self.client.get(f"{THREADS}{thread['id']}/").data
        self.assertEqual(detail['preview'], thread['preview'])
        self.assertEqual(detail['has_attachments'], thread['has_attachments'])
