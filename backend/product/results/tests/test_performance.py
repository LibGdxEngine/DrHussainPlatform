"""A report's values are compared with the patient's history in one query, not one per value."""
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.comparison import compare, compare_many
from product.results.models import ResultValue
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.testing import PrivateStorageMixin, make_member

BASE = '/api/product/results/'


class ComparisonPerformanceTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.client.force_authenticate(self.staff)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))
        self.first = process_document(self._document(pdfs.header(collected='03/07/2026') + pdfs.BLOODS, 'july.pdf'))
        later = pdfs.header(collected='03/10/2026') + ['Ferritin 48.0 ng/mL 13 - 150', 'TSH 2.1 mIU/L 0.4 - 4.0']
        self.second = process_document(self._document(later, 'october.pdf'))

    def _document(self, lines, name):
        return store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile(name, pdfs.make_pdf(lines), content_type='application/pdf'),
        )

    def _history_queries(self, queries):
        """The batch look-up of earlier values: one query over the tests in hand."""
        return [q['sql'] for q in queries if 'results_resultvalue' in q['sql'] and 'lab_test_id" IN (' in q['sql']]

    def test_batch_comparison_matches_one_by_one(self):
        values = list(self.second.values.select_related('report', 'lab_test'))
        batched = compare_many(values)
        for value in values:
            single = compare(value)
            self.assertEqual((batched[value.pk].change, batched[value.pk].reasons), (single.change, single.reasons))
            self.assertEqual(getattr(batched[value.pk].previous, 'pk', None), getattr(single.previous, 'pk', None))
        self.assertEqual({r.change for r in batched.values()}, {'up', 'down', 'same'} & {r.change for r in batched.values()})

    def test_report_values_are_compared_with_one_history_query(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f'{BASE}reports/{self.second.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self._history_queries(queries)), 1)
        changes = {v['test']['code']: v['comparison']['change'] for v in response.data['values']}
        self.assertEqual(changes['ferritin'], 'up')
        self.assertEqual(response.data['values'][0]['comparison']['previous']['result_date'], '2026-07-03')

    def test_history_list_is_compared_with_one_query(self):
        self.assertGreater(ResultValue.objects.filter(patient=self.patient).count(), 3)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f'{BASE}history/', {'patient': str(self.patient.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self._history_queries(queries)), 1)
        self.assertEqual(response.data['count'], len(response.data['results']))
