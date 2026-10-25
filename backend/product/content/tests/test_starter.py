import threading

from django.db import connection
from django.test import TransactionTestCase

from apps.organizations.models import Organization
from product.content.models import AlertRule, EmailTemplate
from product.content.starter import ensure_starter_content
from product.results.catalog import ensure_catalog
from product.results.models import LabTest


class ConcurrentSeedingTests(TransactionTestCase):
    """A settings screen loads several lists at once; the first visit must seed the clinic exactly once."""

    def run_together(self, seed, organization):
        errors = []

        def worker():
            try:
                seed(organization)
            except Exception as exc:  # noqa: BLE001 - surfaced through the assertion below
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])

    def test_starter_content(self):
        clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.run_together(ensure_starter_content, clinic)
        self.assertEqual(AlertRule.objects.filter(organization=clinic).count(), 40)
        self.assertEqual(EmailTemplate.objects.filter(organization=clinic, key='sti_opening').count(), 1)

    def test_test_catalog(self):
        clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.run_together(ensure_catalog, clinic)
        self.assertEqual(LabTest.objects.filter(organization=clinic, code='ferritin').count(), 1)
