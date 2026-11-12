"""Default aliases added in a later release reach clinics whose catalog was loaded before it."""
from importlib import import_module

from django.apps import apps
from django.test import TestCase

from apps.organizations.models import Organization
from product.results.catalog import Catalog, ensure_catalog
from product.results.models import LabTest, LabTestAlias

migration = import_module('product.results.migrations.0005_add_later_default_aliases')


class LaterAliasTests(TestCase):
    def setUp(self):
        self.old = Organization.objects.create(name='Old clinic', slug='old-clinic')
        self.custom = Organization.objects.create(name='Custom clinic', slug='custom-clinic')
        for clinic in (self.old, self.custom):
            ensure_catalog(clinic)
            # As loaded before the alias existed.
            LabTestAlias.objects.filter(organization=clinic, alias='vitamin d 25 oh').delete()
        # This clinic already gave the name to a test of its own.
        own = LabTest.objects.create(organization=self.custom, code='vit_d_own', name='Own vitamin D')
        LabTestAlias.objects.create(organization=self.custom, lab_test=own, alias='vitamin d 25 oh')

    def test_an_existing_clinic_gets_the_alias_once_and_a_clinic_name_is_kept(self):
        self.assertIsNone(Catalog(self.old).resolve('Vitamin D 25-OH'))  # held as name_unknown
        migration.add_aliases(apps, None)
        migration.add_aliases(apps, None)
        self.assertEqual(Catalog(self.old).resolve('Vitamin D 25-OH').code, 'vitamin_d')
        self.assertEqual(LabTestAlias.objects.filter(organization=self.old, alias='vitamin d 25 oh').count(), 1)
        self.assertEqual(Catalog(self.custom).resolve('Vitamin D 25-OH').code, 'vit_d_own')

    def test_a_new_clinic_has_it_from_the_start(self):
        clinic = Organization.objects.create(name='New clinic', slug='new-clinic')
        ensure_catalog(clinic)
        self.assertEqual(Catalog(clinic).resolve('Vitamin D 25-OH').code, 'vitamin_d')
