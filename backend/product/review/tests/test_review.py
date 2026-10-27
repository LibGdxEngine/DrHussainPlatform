from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMember
from product.content.models import ClinicProfile, EmailTemplate, EmailTemplateVersion, PrescriptionItem
from product.content.starter import ensure_starter_content
from product.content.versioning import add_version
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.review.models import ResultsCase, ReviewAction, SentEmail
from product.review.services import route_report
from product.review.tasks import send_case_email
from product.testing import PrivateStorageMixin, make_member

BASE = '/api/product/review/cases/'
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


class ReviewTestCase(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        ClinicProfile.objects.create(organization=self.clinic, display_name='V-Clinic', phone='+20 2 0000 0000',
                                     doctor_name='Dr Example')
        ensure_starter_content(self.clinic)

    def approve(self, key, body, subject='Your results', language='en'):
        template = EmailTemplate.objects.get(organization=self.clinic, key=key, language=language)
        version, _ = add_version(template, EmailTemplateVersion, {'subject': subject, 'body': body},
                                 user=self.doctor, note='Test wording')
        version.approved_by, version.approved_at = self.doctor, timezone.now()
        version.save()
        return template

    def read(self, lines, name='report.pdf', slot='lab'):
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot=slot,
            upload=SimpleUploadedFile(name, pdfs.make_pdf(lines), content_type='application/pdf'),
        )
        report = process_document(document)
        return route_report(report)

    def detail(self, case):
        return self.client.get(f'{BASE}{case.id}/').data


class RoutingTests(ReviewTestCase):
    def test_first_bloods_draft_from_the_results_template(self):
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}\nCall {{clinic.phone}}.')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual((case.status, case.route), ('drafted', 'results'))
        draft = self.detail(case)['draft']
        self.assertIn('Dear Laila,', draft['body'])
        self.assertIn('Ferritin: 32.0 ng/mL (low) (reference 13 - 150)', draft['body'])
        self.assertIn('Call +20 2 0000 0000.', draft['body'])
        self.assertEqual(draft['open_slots'], [])
        self.assertEqual([(t['key'], t['number']) for t in draft['template_versions']], [('results', 2)])

    def test_menopause_bloods_use_their_own_template(self):
        self.approve('menopause_results', 'Dear {{patient.first_name}}, phone {{clinic.phone}} to book.')
        case = self.read(pdfs.header() + pdfs.BLOODS)
        self.assertEqual(case.route, 'menopause')

    def test_template_without_approved_wording_flags_instead_of_drafting(self):
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['template_not_approved']))
        self.assertIsNone(self.detail(case)['draft'])

    def test_follow_up_results_are_compared(self):
        self.approve('results', '{{results.table}}')
        self.approve('follow_up_comparison', 'Dear {{patient.first_name}},\n{{comparison.table}}')
        self.read(pdfs.header(collected='03/07/2026') + pdfs.BLOODS[:3], name='july.pdf')
        later = ['Ferritin 48.0 ng/mL 13 - 150', 'TSH 1.8 mIU/L 0.4 - 4.0']
        case = self.read(pdfs.header(collected='03/10/2026') + later, name='october.pdf')
        self.assertEqual(case.route, 'follow_up')
        body = self.detail(case)['draft']['body']
        self.assertIn('Ferritin: 32.0 ng/mL on 3 Jul 2026 → 48.0 ng/mL on 3 Oct 2026 (higher)', body)
        self.assertIn('TSH: 1.8 mIU/L on 3 Jul 2026 → 1.8 mIU/L on 3 Oct 2026 (unchanged)', body)

    def test_sti_email_is_opening_one_section_per_positive_result_and_closing(self):
        self.approve('sti_opening', 'Dear {{patient.first_name}},', subject='Your swab results')
        self.approve('sti_section_chlamydia', '{{result.name}} was {{result.value}}. {{prescription}}')
        self.approve('sti_section_gonorrhoea', 'Gonorrhoea section')
        self.approve('sti_closing', 'Best wishes')
        case = self.read(pdfs.header() + pdfs.STI)
        self.assertEqual(case.route, 'infection')
        draft = self.detail(case)['draft']
        self.assertEqual(draft['subject'], 'Your swab results')
        self.assertEqual([t['key'] for t in draft['template_versions']],
                         ['sti_opening', 'sti_section_chlamydia', 'sti_closing'])
        self.assertIn('Chlamydia trachomatis was Detected. [[prescription]]', draft['body'])
        self.assertNotIn('Gonorrhoea section', draft['body'])
        self.assertEqual(draft['open_slots'], ['prescription'])

    def test_all_negative_swab_uses_the_normal_results_email(self):
        self.approve('results', '{{results.table}}')
        negative = ['High vaginal swab', 'Chlamydia trachomatis: Not detected', 'Trichomonas vaginalis Negative']
        case = self.read(pdfs.header() + negative)
        self.assertEqual((case.route, case.status), ('results', 'drafted'))

    def test_normal_smear_uses_section_1(self):
        self.approve('smear_section_1', 'Normal. Repeat in 3 to 5 years.')
        case = self.read(pdfs.header() + pdfs.SMEAR_NORMAL, slot='path')
        self.assertEqual((case.route, case.status), ('smear', 'drafted'))

    def test_abnormal_smear_has_no_draft_until_the_doctor_picks_the_plan(self):
        self.approve('smear_section_5', 'Colposcopy: [[appointment date]]', subject='Your smear result')
        case = self.read(pdfs.header() + pdfs.SMEAR_ABNORMAL, slot='path')
        self.assertEqual(case.status, 'awaiting_plan')
        detail = self.detail(case)
        self.assertIsNone(detail['draft'])
        self.assertEqual([p['key'] for p in detail['smear_plans']][:2], ['smear_section_2', 'smear_section_3'])
        self.assertTrue(next(p for p in detail['smear_plans'] if p['key'] == 'smear_section_5')['approved'])

        refused = self.client.post(f'{BASE}{case.id}/plan/', {'template': 'results'}, format='json')
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        chosen = self.client.post(f'{BASE}{case.id}/plan/', {'template': 'smear_section_5'}, format='json')
        self.assertEqual(chosen.status_code, status.HTTP_200_OK, chosen.data)
        self.assertEqual((chosen.data['status'], chosen.data['plan_template']), ('drafted', 'smear_section_5'))
        self.assertEqual(chosen.data['draft']['open_slots'], ['appointment date'])

    def test_patient_doubt_is_flagged_and_routed_again_once_the_doctor_confirms(self):
        self.approve('results', '{{results.table}}')
        case = self.read(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS[:3])
        self.assertEqual(case.status, 'flagged')
        self.assertIn('patient_not_found', case.flag_reasons)
        confirm = self.client.post(f'/api/product/results/reports/{case.report_id}/confirm/')
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')

    def test_doctor_can_draft_a_flagged_report_anyway(self):
        self.approve('results', '{{results.table}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3] + ['Vitamin D   ?? ng/mL'])
        self.assertEqual(case.flag_reasons, ['unreadable_value'])
        response = self.client.post(f'{BASE}{case.id}/draft-anyway/', {'reason': 'Vitamin D not needed'},
                                    format='json')
        self.assertEqual(response.data['status'], 'drafted')
        self.assertIn('Vitamin D: could not be read', response.data['draft']['body'])
        self.assertTrue(ReviewAction.objects.filter(case=case, action='drafted_anyway').exists())

        # Later choices rebuild the draft without the doctor overriding the flags again.
        rebuilt = self.client.post(f'{BASE}{case.id}/options/', {'follow_up': 'Repeat in 3 months'}, format='json')
        self.assertEqual(rebuilt.status_code, status.HTTP_200_OK, rebuilt.data)
        self.assertEqual(rebuilt.data['status'], 'drafted')

        # Reading the report again brings its flags back.
        route_report(case.report)
        case.refresh_from_db()
        self.assertEqual((case.status, case.flags_overridden), ('flagged', False))

    def test_sent_and_rejected_cases_are_not_reopened_by_reading_again(self):
        self.approve('results', '{{results.table}}')
        case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.client.post(f'{BASE}{case.id}/reject/', {'reason': 'Sent by phone'}, format='json')
        route_report(case.report)
        case.refresh_from_db()
        self.assertEqual(case.status, 'rejected')


class ReviewActionTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}\n{{prescription}}\nRepeat in [[interval]].')
        self.case = self.read(pdfs.header() + pdfs.BLOODS[:3])

    def test_prescription_choice_fills_the_placeholder(self):
        item = PrescriptionItem.objects.create(organization=self.clinic)
        from product.content.models import PrescriptionVersion
        add_version(item, PrescriptionVersion, {'drug': 'Example 100 mg', 'dose': '1 tablet', 'directions': 'Daily'},
                    user=self.doctor)
        response = self.client.post(f'{BASE}{self.case.id}/options/', {'prescriptions': [str(item.id)]},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('Example 100 mg 1 tablet. Daily', response.data['draft']['body'])
        self.assertEqual(response.data['draft']['open_slots'], ['interval'])

    def test_open_blanks_block_sending_until_the_doctor_fills_them(self):
        refused = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(refused.data['error']['code'], 'open_slots')

        body = self.detail(self.case)['draft']['body'].replace('[[prescription]]', 'No treatment needed.')
        body = body.replace('[[interval]]', '3 months')
        edited = self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': body}, format='json')
        self.assertEqual(edited.data['draft']['open_slots'], [])
        self.assertTrue(edited.data['draft']['edited'])

    def test_approve_sends_once_with_attachments_and_keeps_a_copy(self):
        leaflet = self.client.post('/api/product/content/leaflets/', {
            'title': 'Iron leaflet', 'file': SimpleUploadedFile('iron.pdf', PDF, content_type='application/pdf'),
        }, format='multipart').data
        body = self.detail(self.case)['draft']['body'].replace('[[prescription]]', '').replace('[[interval]]', '3 months')
        self.client.patch(f'{BASE}{self.case.id}/draft/', {
            'body': body, 'leaflets': [leaflet['id']], 'attach_report': True,
        }, format='json')

        with patch('product.review.tasks.send_case_email.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            approved = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        self.assertEqual(approved.data['status'], 'sending')
        self.assertEqual(mail.outbox, [])  # nothing leaves before the task runs
        sent = SentEmail.objects.get(case=self.case)
        delay.assert_called_once_with(str(sent.id))

        send_case_email.apply(args=[str(sent.id)])
        send_case_email.apply(args=[str(sent.id)])
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['laila@example.com'])
        self.assertEqual(sorted(name for name, *_ in message.attachments), ['iron.pdf', 'report.pdf'])
        sent.refresh_from_db()
        self.assertEqual(sent.status, 'sent')
        self.assertEqual(message.extra_headers['Message-ID'], sent.message_id)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status, 'sent')
        self.assertEqual([a.action for a in self.case.actions.order_by('created_at')][-2:], ['approved', 'sent'])

    def test_patient_without_email_cannot_be_sent(self):
        self.patient.email = ''
        self.patient.save()
        body = self.detail(self.case)['draft']['body'].replace('[[prescription]]', '').replace('[[interval]]', 'x')
        self.client.patch(f'{BASE}{self.case.id}/draft/', {'body': body}, format='json')
        response = self.client.post(f'{BASE}{self.case.id}/approve/')
        self.assertEqual(response.data['error']['code'], 'no_patient_email')

    def test_staff_can_see_the_queue_but_never_approve(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(BASE).status_code, status.HTTP_200_OK)
        for path in ('approve/', 'options/', 'reject/'):
            self.assertEqual(self.client.post(f'{BASE}{self.case.id}/{path}', {}, format='json').status_code,
                             status.HTTP_403_FORBIDDEN)

    def test_arabic_draft_without_an_approved_translation_asks_the_doctor_to_translate(self):
        response = self.client.post(f'{BASE}{self.case.id}/options/', {'language': 'ar'}, format='json')
        self.assertEqual(response.data['draft']['language'], 'ar')
        self.assertTrue(response.data['draft']['body'].startswith('[[Translate into Arabic]]'))
        self.assertIn('Translate into Arabic', response.data['draft']['open_slots'])

    def test_queue_groups_and_counts(self):
        self.read(pdfs.header(dob='01/01/1980', file_number='') + pdfs.BLOODS[:3], name='other.pdf')
        counts = self.client.get(f'{BASE}counts/').data
        self.assertEqual(counts, {'needs_doctor': 1, 'ready': 1, 'sent': 0, 'rejected': 0})
        ready = self.client.get(BASE, {'group': 'ready'}).data['results']
        self.assertEqual([c['id'] for c in ready], [str(self.case.id)])

    def test_every_action_is_logged(self):
        self.client.post(f'{BASE}{self.case.id}/options/', {'follow_up': 'Repeat bloods in 3 months'}, format='json')
        actions = [a['action'] for a in self.detail(self.case)['actions']]
        self.assertEqual(actions, ['opened', 'drafted', 'drafted'])


class NoAutoSendTests(ReviewTestCase):
    """The spec: there is no setting or code path that sends a draft without the doctor's approval."""

    def test_only_approve_and_send_queues_the_send_task(self):
        product_dir = Path(settings.BASE_DIR) / 'product'
        callers = sorted(
            str(path.relative_to(product_dir)) for path in product_dir.rglob('*.py')
            if 'tests' not in path.parts and 'send_case_email' in path.read_text(encoding='utf-8')
        )
        self.assertEqual(callers, ['review/services.py', 'review/tasks.py'])
        services = (product_dir / 'review' / 'services.py').read_text(encoding='utf-8')
        self.assertEqual(services.count('send_case_email.delay'), 1)
        approve_body = services.split('def approve_and_send', 1)[1]
        self.assertIn('send_case_email.delay', approve_body)

    def test_no_auto_send_setting_exists(self):
        self.assertFalse([name for name in dir(settings) if 'AUTO_SEND' in name or 'AUTOSEND' in name])

    def test_reading_a_report_never_sends(self):
        self.approve('results', '{{results.table}}')
        with patch('product.review.tasks.send_case_email.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            case = self.read(pdfs.header() + pdfs.BLOODS[:3])
        self.assertEqual(case.status, ResultsCase.Status.DRAFTED)
        delay.assert_not_called()
        self.assertEqual(mail.outbox, [])
