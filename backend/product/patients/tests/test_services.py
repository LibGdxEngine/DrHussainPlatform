from datetime import date

from django.test import TestCase

from apps.organizations.models import Organization
from product.patients.models import Patient
from product.patients.services import (
    MatchStatus, create_patient, find_similar, match_patient, normalize_name, search_patients,
)

DOB = date(1974, 3, 9)


class NormalizeNameTests(TestCase):
    def test_ignores_case_punctuation_spacing_and_titles(self):
        self.assertEqual(normalize_name('  Mrs. Laila   AHMED '), 'laila ahmed')

    def test_folds_arabic_spelling_variants(self):
        # Hamza forms, taa marbuta, alef maqsura and diacritics vary by writer; all spell the same person.
        self.assertEqual(normalize_name('ليلى  أحمد'), 'ليلي احمد')
        self.assertEqual(normalize_name('د. فاطمة إبراهيم'), 'فاطمه ابراهيم')
        self.assertEqual(normalize_name('مُحَمَّد عـلي'), 'محمد علي')
        self.assertEqual(normalize_name('ليلي احمد'), normalize_name('ليلى أحمد'))


class SearchPatientsTests(TestCase):
    def setUp(self):
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.laila = create_patient(self.clinic, full_name='Laila Ahmed', full_name_ar='ليلى أحمد', date_of_birth=DOB)
        self.nour = create_patient(self.clinic, full_name='Nour Saleh', date_of_birth=date(1974, 9, 3))
        self.salma = create_patient(self.clinic, full_name='Salma Nabil', date_of_birth=date(1975, 3, 8))
        self.far = create_patient(self.clinic, full_name='Laila Far', date_of_birth=date(1980, 3, 9))

    def search(self, **kwargs):
        return [p.full_name for p in search_patients(Patient.objects.filter(organization=self.clinic), **kwargs)]

    def test_name_in_english_or_arabic(self):
        self.assertEqual(self.search(query='laila'), ['Laila Ahmed', 'Laila Far'])
        self.assertEqual(self.search(query='ليلي'), ['Laila Ahmed'])
        self.assertEqual(self.search(query='أحمد'), ['Laila Ahmed'])

    def test_date_of_birth_finds_nearby_birthdays_nearest_first(self):
        # Exact day first, then a swapped day/month, then a day and a year off; 1980 is outside the window.
        self.assertEqual(self.search(date_of_birth=DOB), ['Laila Ahmed', 'Nour Saleh', 'Salma Nabil'])

    def test_name_and_date_of_birth_together(self):
        self.assertEqual(self.search(query='laila', date_of_birth=date(1974, 3, 10)), ['Laila Ahmed'])


class FindSimilarTests(TestCase):
    def test_same_arabic_name_and_birthday_is_similar(self):
        clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        laila = create_patient(clinic, full_name='Laila Ahmed', full_name_ar='ليلى أحمد', date_of_birth=DOB)
        self.assertEqual(list(find_similar(clinic, 'Layla A.', DOB, 'ليلي احمد')), [laila])
        self.assertEqual(list(find_similar(clinic, 'ليلى أحمد', DOB)), [laila])
        self.assertEqual(list(find_similar(clinic, 'Layla A.', DOB)), [])


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

    def test_arabic_report_name_matches_the_arabic_name_on_file(self):
        self.laila.full_name_ar = 'ليلى أحمد'
        self.laila.save()
        result = self.match(date_of_birth=DOB, full_name='ليلي احمد')
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
