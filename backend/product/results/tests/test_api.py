from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.models import InvestigationReport
from product.results.pipeline import process_document
from product.testing import PrivateStorageMixin, make_member

from . import pdfs

BASE = '/api/product/results/'


class ResultsApiTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.staff)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9))

    def document(self, lines, name='report.pdf', slot='lab'):
        return store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot=slot,
            upload=SimpleUploadedFile(name, pdfs.make_pdf(lines), content_type='application/pdf'),
        )

    def test_tracked_catalog_matches_the_key_values_panel(self):
        response = self.client.get(f'{BASE}tests/', {'tracked': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([t['code'] for t in response.data],
                         ['ferritin', 'estradiol', 'testosterone_total', 'hba1c', 'ldl', 'tsh'])
        self.assertEqual(response.data[0]['optimal_text'], '50–150')

    def test_report_lists_values_with_previous_results(self):
        process_document(self.document(pdfs.header(collected='03/07/2026') + pdfs.BLOODS, name='july.pdf'))
        later = pdfs.header(collected='03/10/2026') + ['Ferritin 48.0 ng/mL 13 - 150']
        document = self.document(later, name='october.pdf')
        process_document(document)

        response = self.client.get(f'{BASE}reports/', {'document': str(document.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        [report] = response.data
        [ferritin] = report['values']
        self.assertEqual(ferritin['test']['code'], 'ferritin')
        self.assertEqual(ferritin['comparison']['change'], 'up')
        self.assertEqual(ferritin['comparison']['previous']['value_text'], '32.0')
        self.assertEqual(ferritin['comparison']['previous']['result_date'], '2026-07-03')

    def test_opening_a_report_is_audited(self):
        report = process_document(self.document(pdfs.header() + pdfs.BLOODS))
        self.assertEqual(self.client.get(f'{BASE}reports/{report.id}/').status_code, status.HTTP_200_OK)
        self.assertTrue(AuditLog.objects.filter(action='report.opened', resource_id=str(report.id)).exists())

    def test_staff_type_values_for_an_unread_document(self):
        document = self.document(['Scanned page'], slot='paper')
        response = self.client.post(f'{BASE}manual-values/', {
            'document': str(document.id), 'result_date': '2026-10-03',
            'values': [{'test': 'ferritin', 'value': '32'}, {'test': 'tsh', 'value': '1.8'}, {'test': 'ldl', 'value': ''}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['method'], 'manual')
        self.assertTrue(response.data['in_history'])
        self.assertEqual(sorted((v['test']['code'], v['value_text'], v['unit']) for v in response.data['values']),
                         [('ferritin', '32', 'ng/mL'), ('tsh', '1.8', 'mIU/L')])

        # Saving again replaces the typed value; a blank value removes it.
        again = self.client.post(f'{BASE}manual-values/', {
            'document': str(document.id), 'values': [{'test': 'ferritin', 'value': '35'}, {'test': 'tsh', 'value': ''}],
        }, format='json')
        self.assertEqual([(v['test']['code'], v['value_text']) for v in again.data['values']], [('ferritin', '35')])
        self.assertTrue(AuditLog.objects.filter(action='report.values_entered').exists())

    def test_manual_numbers_are_validated(self):
        document = self.document(['Scanned page'], slot='paper')
        response = self.client.post(f'{BASE}manual-values/', {
            'document': str(document.id), 'values': [{'test': 'ferritin', 'value': 'low'}, {'test': 'nope', 'value': '1'}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('values', response.data['error']['fields'])

    def test_only_the_doctor_confirms_a_flagged_report(self):
        report = process_document(self.document(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS))
        self.assertFalse(report.in_history)
        url = f'{BASE}reports/{report.id}/confirm/'
        self.assertEqual(self.client.post(url).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.doctor)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'confirmed')
        self.assertTrue(response.data['in_history'])
        self.assertTrue(AuditLog.objects.filter(action='report.confirmed', resource_id=str(report.id)).exists())

    def test_history_only_holds_reports_sure_to_be_this_patient(self):
        process_document(self.document(pdfs.header(collected='03/07/2026') + pdfs.BLOODS, name='a.pdf'))
        process_document(self.document(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS, name='b.pdf'))
        response = self.client.get(f'{BASE}history/', {'patient': str(self.patient.id), 'test': 'ferritin'})
        self.assertEqual([v['result_date'] for v in response.data], ['2026-07-03'])
        self.assertEqual(self.client.get(f'{BASE}history/').data, [])

    def test_reread_queues_the_file_again(self):
        report = process_document(self.document(pdfs.header() + pdfs.BLOODS))
        with patch('product.results.views.read_report.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'{BASE}reports/{report.id}/reread/')
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data['status'], 'pending')
        delay.assert_called_once()
        self.assertEqual(delay.call_args.args, (str(report.document_id),))

    def test_lab_uploads_are_queued_for_reading(self):
        form = {'patient': str(self.patient.id), 'slot': 'lab',
                'file': SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.BLOODS), content_type='application/pdf')}
        with patch('product.results.tasks.read_report.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/product/records/documents/', form, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        delay.assert_called_once_with(response.data['id'])

        letter = {'patient': str(self.patient.id), 'slot': 'letter',
                  'file': SimpleUploadedFile('l.pdf', pdfs.make_pdf(['Letter']), content_type='application/pdf')}
        with patch('product.results.tasks.read_report.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            self.client.post('/api/product/records/documents/', letter, format='multipart')
        delay.assert_not_called()

    def test_other_clinics_reports_are_hidden(self):
        report = process_document(self.document(pdfs.header() + pdfs.BLOODS))
        other = Organization.objects.create(name='Other', slug='other')
        self.client.force_authenticate(make_member(other, 'outsider@example.com'))
        self.assertEqual(self.client.get(f'{BASE}reports/{report.id}/').status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(InvestigationReport.objects.count(), 1)

    def test_files_never_read_can_be_queued(self):
        document = self.document(pdfs.header() + pdfs.BLOODS)
        with patch('product.results.views.read_report.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'{BASE}reports/read/', {'document': str(document.id)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(delay.call_args.args, (str(document.id),))

        letter = self.document(['Letter'], name='letter.pdf', slot='letter')
        refused = self.client.post(f'{BASE}reports/read/', {'document': str(letter.id)}, format='json')
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
