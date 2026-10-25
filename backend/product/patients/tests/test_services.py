from datetime import date

from django.test import TestCase

from apps.organizations.models import Organization
from product.patients.services import MatchStatus, create_patient, match_patient, normalize_name

DOB = date(1974, 3, 9)


class NormalizeNameTests(TestCase):
    def test_ignores_case_punctuation_spacing_and_titles(self):
        self.assertEqual(normalize_name('  Mrs. Laila   AHMED '), 'laila ahmed')

    def test_keeps_arabic_names(self):
        self.assertEqual(normalize_name('ليلى  أحمد'), 'ليلى أحمد')


class FileNumberTests(TestCase):
    def test_numbers_are_sequential_per_clinic(self):
        clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        other = Organization.objects.create(name='Other', slug='other')
        first = create_patient(clinic, full_name='A', date_of_birth=DOB)
        second = create_patient(clinic, full_name='B', date_of_birth=DOB)
        elsewhere = create_patient(other, full_name='C', date_of_birth=DOB)
        self.assertEqual([first.file_number, second.file_number], ['VC-000001', 'VC-000002'])
        self.assertEqual(elsewhere.file_number, 'VC-000001')


class MatchPatientTests(TestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.laila = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=DOB)
        # Same birthday, different person: date of birth alone must never decide.
        self.nour = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=DOB)

    def match(self, **identifiers):
        return match_patient(self.clinic, **identifiers)

    def test_date_of_birth_and_name_agree(self):
        result = self.match(date_of_birth=DOB, full_name='LAILA AHMED')
        self.assertEqual(result.status, MatchStatus.MATCHED)
        self.assertEqual(result.patient, self.laila)

    def test_date_of_birth_and_file_number_agree(self):
        result = self.match(date_of_birth=DOB, file_number=self.nour.file_number.lower())
        self.assertEqual(result.status, MatchStatus.MATCHED)
        self.assertEqual(result.patient, self.nour)

    def test_all_three_agree(self):
        result = self.match(date_of_birth=DOB, full_name='Laila Ahmed', file_number=self.laila.file_number)
        self.assertTrue(result.is_confirmed)

    def test_date_of_birth_alone_is_uncertain(self):
        result = self.match(date_of_birth=DOB)
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['missing_second_identifier'])

    def test_missing_date_of_birth_is_uncertain(self):
        result = self.match(date_of_birth=None, full_name='Laila Ahmed')
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)

    def test_name_and_file_number_disagree(self):
        result = self.match(date_of_birth=DOB, full_name='Laila Ahmed', file_number=self.nour.file_number)
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['name_mismatch'])

    def test_file_number_with_wrong_date_of_birth(self):
        result = self.match(date_of_birth=date(1980, 1, 1), file_number=self.laila.file_number)
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['file_number_date_of_birth_mismatch'])

    def test_name_with_wrong_date_of_birth(self):
        result = self.match(date_of_birth=DOB, full_name='Salma Nabil')
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['name_date_of_birth_mismatch'])

    def test_unknown_file_number_with_matching_name(self):
        result = self.match(date_of_birth=DOB, full_name='Laila Ahmed', file_number='VC-999999')
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['unknown_file_number'])

    def test_two_files_with_same_name_and_date_of_birth(self):
        create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=DOB)
        result = self.match(date_of_birth=DOB, full_name='Laila Ahmed')
        self.assertEqual(result.status, MatchStatus.UNCERTAIN)
        self.assertEqual(result.reasons, ['ambiguous'])

    def test_nobody_with_that_date_of_birth(self):
        result = self.match(date_of_birth=date(1990, 5, 5), full_name='Laila Ahmed')
        self.assertEqual(result.status, MatchStatus.NOT_FOUND)

    def test_other_clinics_are_never_matched(self):
        other = Organization.objects.create(name='Other', slug='other')
        result = match_patient(other, date_of_birth=DOB, full_name='Laila Ahmed')
        self.assertEqual(result.status, MatchStatus.NOT_FOUND)
