"""One current draft per case, and a rejection cannot cross an approval already under way."""
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext

from product.results.tests import pdfs
from product.review.models import Draft, ResultsCase
from product.review.services import ReviewError, reject

from .test_review import BASE, ReviewTestCase


class DraftConcurrencyTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}')
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])

    def test_a_case_cannot_hold_two_current_drafts(self):
        self.assertIsNotNone(self.case.current_draft)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Draft.objects.create(case=self.case, subject='Second', body='x')
        Draft.objects.create(case=self.case, subject='Older', body='x', is_current=False)
        self.assertEqual(self.case.drafts.count(), 2)

    def test_rebuilding_replaces_the_current_draft_cleanly(self):
        response = self.client.post(f'{BASE}{self.case.id}/options/', {'follow_up': 'Repeat in 3 months'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.case.drafts.filter(is_current=True).count(), 1)
        self.assertEqual(self.case.drafts.count(), 2)
        self.assertEqual(self.case.current_draft.follow_up, 'Repeat in 3 months')

    def test_rejecting_after_approval_is_refused(self):
        ResultsCase.objects.filter(pk=self.case.pk).update(status=ResultsCase.Status.SENDING)
        with self.assertRaises(ReviewError) as refused:
            reject(self.case, user=self.doctor, reason='no')  # the in-memory case still says "drafted"
        self.assertEqual(refused.exception.code, 'already_sent')
        self.assertEqual(ResultsCase.objects.get(pk=self.case.pk).status, ResultsCase.Status.SENDING)

    def test_reject_closes_the_draft(self):
        reject(self.case, user=self.doctor, reason='Wrong patient')
        self.assertEqual(self.case.status, ResultsCase.Status.REJECTED)
        self.assertIsNone(ResultsCase.objects.get(pk=self.case.pk).current_draft)

    def test_case_detail_takes_the_current_draft_from_the_prefetch(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f'{BASE}{self.case.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data['draft'])
        # The drafts come from one prefetch (by case); no query asks for the current one by itself.
        lookups = [q['sql'] for q in queries if 'review_draft' in q['sql'] and 'is_current' in q['sql'].partition('WHERE')[2]]
        self.assertEqual(lookups, [])
