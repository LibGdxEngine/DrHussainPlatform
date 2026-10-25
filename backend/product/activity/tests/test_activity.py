from datetime import date

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User, UserStatus
from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.content.models import EmailTemplate, EmailTemplateVersion
from product.content.starter import ensure_starter_content
from product.content.versioning import add_version
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.review.services import approve_and_send, route_report
from product.review.tasks import send_case_email
from product.testing import PrivateStorageMixin, make_member

URL = '/api/product/activity/'


class AccessLoggingTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        other = Organization.objects.create(name='Other', slug='other')
        self.outsider = make_member(other, 'outsider@example.com', role=OrganizationMember.Role.OWNER)

    def sign_in(self, identifier, password='StrongPassword123!', forwarded='203.0.113.9'):
        return self.client.post('/api/v1/auth/login/', {'identifier': identifier, 'password': password},
                                format='json', HTTP_X_FORWARDED_FOR=f'10.0.0.1, {forwarded}')

    def test_sign_ins_and_failures_are_logged_with_the_client_address(self):
        User.objects.filter(pk=self.staff.pk).update(status=UserStatus.ACTIVE, phone_verified_at=timezone.now())
        self.assertEqual(self.sign_in('staff@example.com').status_code, status.HTTP_200_OK)
        self.sign_in('staff@example.com', password='wrong-password')
        signin = AuditLog.objects.get(action='auth.signin')
        self.assertEqual((signin.actor, signin.ip_address), (self.staff, '203.0.113.9'))
        failed = AuditLog.objects.get(action='auth.signin_failed')
        self.assertEqual(failed.metadata, {'identifier': 'staff@example.com'})
        self.assertNotIn('wrong-password', str(failed.metadata))

    def test_refused_doctor_actions_and_searches_are_logged(self):
        self.client.force_authenticate(self.staff)
        self.client.patch('/api/product/content/profile/', {'phone': '1'}, format='json')
        denied = AuditLog.objects.get(action='access.denied')
        self.assertEqual((denied.actor, denied.metadata['method']), (self.staff, 'PATCH'))
        self.client.get('/api/product/patients/', {'q': 'laila'})
        searched = AuditLog.objects.get(action='patient.searched')
        self.assertEqual((searched.metadata['query'], searched.metadata['results']), ('laila', 1))
        self.client.get('/api/product/results/history/', {'patient': str(self.patient.id)})
        self.assertTrue(AuditLog.objects.filter(action='results.history_viewed', resource_id=str(self.patient.id)).exists())

    def test_the_clinic_sees_its_own_log_filtered(self):
        self.client.force_authenticate(self.staff)
        self.client.get(f'/api/product/patients/{self.patient.id}/')
        self.client.force_authenticate(self.outsider)
        self.client.get('/api/product/patients/')  # another clinic's activity

        self.client.force_authenticate(self.doctor)
        rows = self.client.get(URL).data['results']
        opened = next(r for r in rows if r['action'] == 'patient.opened')
        self.assertEqual((opened['actor_name'], opened['actor_role'], opened['outcome']),
                         ('staff@example.com', 'Member', 'success'))
        self.assertEqual(opened['patient']['file_number'], self.patient.file_number)
        self.assertFalse(any(r['actor_name'] == 'outsider@example.com' for r in rows))
        by_patient = self.client.get(URL, {'patient': self.patient.file_number.lower()}).data['results']
        self.assertTrue(by_patient)
        self.assertTrue(all(r['patient'] and r['patient']['id'] == str(self.patient.id) for r in by_patient))
        self.assertEqual(self.client.get(URL, {'group': 'denied'}).data['count'], 0)

    def test_only_the_doctor_reads_the_log(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.doctor)
        members = self.client.get(f'{URL}members/').data
        self.assertEqual(sorted(m['name'] for m in members), ['doctor@example.com', 'staff@example.com'])


@override_settings(MAIL_ALLOW_PLATFORM_FALLBACK=True)
class ArabicDraftTests(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='ليلى أحمد', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com', preferred_language='ar')
        ensure_starter_content(self.clinic)
        for language, body in (('en', 'Dear {{patient.first_name}}, {{results.table}}'),
                               ('ar', 'عزيزتي {{patient.first_name}}،\n{{results.table}}')):
            template, _ = EmailTemplate.objects.get_or_create(
                organization=self.clinic, key='results', language=language,
                defaults={'name': 'Results', 'kind': 'results'},
            )
            version, _ = add_version(template, EmailTemplateVersion, {'subject': 'نتائجك' if language == 'ar' else 'Results',
                                                                     'body': body}, user=self.doctor)
            version.approved_at = timezone.now()
            version.save()
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.doctor, slot='lab',
            upload=SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.header(name='', dob='09/03/1974', file_number=self.patient.file_number)
                                                              + pdfs.BLOODS[:2]), content_type='application/pdf'),
        )
        self.case = route_report(process_document(document))

    def test_english_by_default_and_an_approved_arabic_translation_on_request(self):
        self.assertEqual(self.case.current_draft.language, 'en')
        response = self.client.post(f'/api/product/review/cases/{self.case.id}/options/', {'language': 'ar'},
                                    format='json')
        draft = response.data['draft']
        self.assertEqual((draft['language'], draft['subject']), ('ar', 'نتائجك'))
        self.assertTrue(draft['body'].startswith('عزيزتي ليلى،'))
        self.assertNotIn('Translate into Arabic', draft['open_slots'])

    def test_arabic_email_is_sent_intact(self):
        self.client.post(f'/api/product/review/cases/{self.case.id}/options/', {'language': 'ar'}, format='json')
        self.case.refresh_from_db()
        sent = approve_and_send(self.case, user=self.doctor)
        send_case_email.apply(args=[str(sent.id)])
        message = mail.outbox[-1]
        self.assertEqual(message.subject, 'نتائجك')
        self.assertIn('عزيزتي ليلى', message.body)
        self.assertIn('utf-8', message.message().as_string().lower())
