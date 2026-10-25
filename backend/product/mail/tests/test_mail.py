from datetime import date
from email.message import EmailMessage as RawEmail
from email.utils import format_datetime, make_msgid
from unittest.mock import patch

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMember
from product.content.models import ClinicProfile, EmailTemplate, EmailTemplateVersion, PrescriptionItem, PrescriptionVersion
from product.content.starter import ensure_starter_content
from product.content.versioning import add_version
from product.mail import services
from product.mail.models import MailMessage, MailThread, Mailbox
from product.mail.tasks import poll_mailbox, send_thread_reply
from product.mail.transport import MailboxNotReady, outgoing
from product.patients.services import create_patient
from product.records.models import Document
from product.records.services import store_document
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.review.models import ResultsCase
from product.review.services import approve_and_send, route_report
from product.review.tasks import send_case_email
from product.testing import PrivateStorageMixin, make_member

LOCMEM = 'django.core.mail.backends.locmem.EmailBackend'
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


def raw_email(*, sender, to='clinic@vclinic.test', subject='Re: Your test results', body='Thank you',
              in_reply_to='', attachments=()):
    message = RawEmail()
    message['From'] = sender
    message['To'] = to
    message['Subject'] = subject
    message['Date'] = format_datetime(timezone.now())
    message['Message-ID'] = make_msgid(domain='patient.example')
    if in_reply_to:
        message['In-Reply-To'] = in_reply_to
        message['References'] = in_reply_to
    message.set_content(body)
    for name, content, kind in attachments:
        maintype, subtype = kind.split('/')
        message.add_attachment(content, maintype=maintype, subtype=subtype, filename=name)
    return message.as_bytes()


@override_settings(MAIL_SMTP_BACKEND=LOCMEM, MAIL_ALLOW_PLATFORM_FALLBACK=False)
class MailTestCase(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        ClinicProfile.objects.create(organization=self.clinic, display_name='V-Clinic', phone='+20 2 0000 0000')
        ensure_starter_content(self.clinic)
        self.mailbox = Mailbox.objects.create(
            organization=self.clinic, address='clinic@vclinic.test', display_name='V-Clinic', enabled=True,
            smtp_host='smtp.vclinic.test', smtp_username='clinic', imap_host='imap.vclinic.test',
            imap_username='clinic',
        )
        self.mailbox.smtp_password = self.mailbox.imap_password = 'app-password'
        self.mailbox.save()

    def approve(self, key, body, subject='Your results'):
        template = EmailTemplate.objects.get(organization=self.clinic, key=key, language='en')
        version, _ = add_version(template, EmailTemplateVersion, {'subject': subject, 'body': body}, user=self.doctor)
        version.approved_by, version.approved_at = self.doctor, timezone.now()
        version.save()

    def send_results(self):
        """A results email the doctor approved, delivered through the clinic mailbox."""
        self.approve('results', 'Dear {{patient.first_name}},\n{{results.table}}\n{{prescription}}')
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.header() + pdfs.BLOODS[:3]),
                                      content_type='application/pdf'),
        )
        case = route_report(process_document(document))
        item = PrescriptionItem.objects.create(organization=self.clinic)
        add_version(item, PrescriptionVersion, {'drug': 'Example iron 200 mg', 'directions': 'Once daily'},
                    user=self.doctor)
        self.client.post(f'/api/product/review/cases/{case.id}/options/', {'prescriptions': [str(item.id)]},
                         format='json')
        sent = approve_and_send(case, user=self.doctor)
        send_case_email.apply(args=[str(sent.id)])
        sent.refresh_from_db()
        return case, sent


class MailboxSettingsTests(MailTestCase):
    def test_passwords_are_encrypted_and_never_returned(self):
        self.assertNotIn('app-password', self.mailbox.smtp_password_encrypted)
        self.assertEqual(Mailbox.objects.get().smtp_password, 'app-password')
        data = self.client.get('/api/product/mail/mailbox/').data
        self.assertTrue(data['has_smtp_password'])
        self.assertNotIn('smtp_password', data)

    def test_blank_password_keeps_the_saved_one_and_staff_cannot_change_settings(self):
        response = self.client.patch('/api/product/mail/mailbox/', {'smtp_password': '', 'smtp_port': 465,
                                                                    'smtp_security': 'ssl'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Mailbox.objects.get().smtp_password, 'app-password')
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.patch('/api/product/mail/mailbox/', {'enabled': False}, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_without_a_mailbox_nothing_can_be_sent(self):
        self.mailbox.enabled = False
        self.mailbox.save()
        with self.assertRaises(MailboxNotReady):
            outgoing(self.clinic)


class SendingTests(MailTestCase):
    def test_results_email_goes_from_the_clinic_mailbox_into_the_patients_thread(self):
        case, sent = self.send_results()
        self.assertEqual(sent.status, 'sent')
        [message] = mail.outbox
        self.assertEqual(message.from_email, 'V-Clinic <clinic@vclinic.test>')
        self.assertEqual(message.to, ['laila@example.com'])
        self.assertEqual(sent.from_address, 'clinic@vclinic.test')
        thread = MailThread.objects.get(patient=self.patient)
        outbound = thread.messages.get()
        self.assertEqual((outbound.direction, outbound.message_id, outbound.sent_email_id), ('out', sent.message_id, sent.id))
        self.assertTrue(thread.has_outbound)
        self.assertFalse(thread.has_inbound)

    def test_approving_is_refused_when_the_clinic_cannot_send(self):
        self.approve('results', '{{results.table}}')
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile('r.pdf', pdfs.make_pdf(pdfs.header() + pdfs.BLOODS[:3]),
                                      content_type='application/pdf'),
        )
        case = route_report(process_document(document))
        self.mailbox.enabled = False
        self.mailbox.save()
        response = self.client.post(f'/api/product/review/cases/{case.id}/approve/')
        self.assertEqual(response.data['error']['code'], 'mailbox_not_set_up')


class ReceivingTests(MailTestCase):
    def test_reply_joins_the_thread_and_a_prescription_question_opens_a_reply_case(self):
        _, sent = self.send_results()
        self.approve('prescription_reply', 'Dear {{patient.first_name}},\nYou asked: {{patient.question}}\n'
                     'Your prescription: {{prescription}}', subject='Re: your prescription')
        question = 'Should I take the iron tablet with food?\n\nOn Mon, the clinic wrote:\n> Dear Laila'
        with self.captureOnCommitCallbacks(execute=True):
            message = services.ingest(self.clinic, raw_email(sender='Laila <laila@example.com>', body=question,
                                                              in_reply_to=sent.message_id))
        thread = MailThread.objects.get(patient=self.patient)
        self.assertEqual(message.thread, thread)
        self.assertTrue(thread.unread)
        self.assertTrue(thread.has_inbound)

        case = ResultsCase.objects.get(kind='reply')
        self.assertEqual((case.status, case.route, case.inbound_message), ('drafted', 'reply', message))
        draft = case.current_draft
        self.assertIn('You asked: Should I take the iron tablet with food?', draft.body)
        self.assertNotIn('> Dear Laila', draft.body)
        self.assertIn('Example iron 200 mg. Once daily', draft.body)

        reply = approve_and_send(case, user=self.doctor)
        send_case_email.apply(args=[str(reply.id)])
        answer = mail.outbox[-1]
        self.assertEqual(answer.to, ['laila@example.com'])
        self.assertEqual(answer.extra_headers['In-Reply-To'], message.message_id)
        self.assertIn(sent.message_id, answer.extra_headers['References'])
        self.assertEqual(thread.messages.count(), 3)

    def test_question_naming_the_prescribed_drug_opens_a_case_without_medicine_words(self):
        _, sent = self.send_results()
        self.approve('prescription_reply', 'You asked: {{patient.question}}')
        with self.captureOnCommitCallbacks(execute=True):
            services.ingest(self.clinic, raw_email(sender='laila@example.com', body='Is the iron fine with food',
                                                   in_reply_to=sent.message_id))
        self.assertTrue(ResultsCase.objects.filter(kind='reply').exists())

    def test_a_plain_question_about_the_prescribed_email_opens_a_case(self):
        _, sent = self.send_results()
        self.approve('prescription_reply', 'You asked: {{patient.question}}')
        with self.captureOnCommitCallbacks(execute=True):
            services.ingest(self.clinic, raw_email(sender='laila@example.com', body='Should I take it at night?',
                                                   in_reply_to=sent.message_id))
        self.assertTrue(ResultsCase.objects.filter(kind='reply').exists())

    def test_other_replies_stay_in_the_inbox_without_a_case(self):
        _, sent = self.send_results()
        with self.captureOnCommitCallbacks(execute=True):
            services.ingest(self.clinic, raw_email(sender='laila@example.com', body='Thank you doctor',
                                                   in_reply_to=sent.message_id))
        self.assertFalse(ResultsCase.objects.filter(kind='reply').exists())

    def test_new_email_from_a_patients_address_is_filed_with_the_patient(self):
        message = services.ingest(self.clinic, raw_email(sender='laila@example.com', subject='Question'))
        self.assertEqual(message.thread.patient, self.patient)

    def test_unknown_sender_is_not_matched_but_a_file_number_is_suggested(self):
        message = services.ingest(self.clinic, raw_email(sender='results@lab.example',
                                                         subject=f'Results for {self.patient.file_number}'))
        thread = message.thread
        self.assertIsNone(thread.patient)
        self.assertEqual(thread.suggested_patient, self.patient)
        response = self.client.post(f'/api/product/mail/threads/{thread.id}/link/', {'patient': str(self.patient.id)},
                                    format='json')
        self.assertEqual(response.data['patient']['file_number'], self.patient.file_number)

    def test_the_same_email_is_taken_in_once(self):
        raw = raw_email(sender='laila@example.com')
        self.assertIsNotNone(services.ingest(self.clinic, raw))
        self.assertIsNone(services.ingest(self.clinic, raw))
        self.assertEqual(MailMessage.objects.count(), 1)

    def test_attachment_is_saved_into_the_patients_file_and_read(self):
        message = services.ingest(self.clinic, raw_email(
            sender='laila@example.com', attachments=[('bloods.pdf', PDF, 'application/pdf')]))
        [attachment] = message.attachments.all()
        with patch('product.results.tasks.read_report.delay') as read, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'/api/product/mail/attachments/{attachment.id}/save/', {'slot': 'lab'},
                                        format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        document = Document.objects.get(pk=response.data['saved_document'])
        self.assertEqual((document.patient, document.source), (self.patient, 'email'))
        read.assert_called_once_with(str(document.pk))


class FakeImap:
    """Just enough of imaplib for polling: one folder with numbered messages."""

    def __init__(self, messages, validity=1):
        self.messages, self.validity, self.logged_out = messages, validity, False

    def select(self, folder, readonly=False):
        return 'OK', [str(len(self.messages)).encode()]

    def response(self, code):
        return code, [str(self.validity).encode()]

    def uid(self, command, *args):
        if command == 'SEARCH':
            low = int(args[1].split()[1].split(':')[0])
            uids = [u for u in self.messages if u >= low] or [max(self.messages)]  # IMAP quirk: N:* always returns the last
            return 'OK', [' '.join(str(u) for u in uids).encode()]
        uid = int(args[0])
        return 'OK', [(f'{uid} (RFC822)'.encode(), self.messages[uid]), b')']

    def logout(self):
        self.logged_out = True


class PollingTests(MailTestCase):
    def test_polling_takes_in_new_mail_once(self):
        server = FakeImap({1: raw_email(sender='laila@example.com', subject='One'),
                           2: raw_email(sender='lab@lab.example', subject='Two')})
        with patch('product.mail.services.imap_connection', return_value=server):
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 2)
            self.assertEqual(poll_mailbox.apply(args=[str(self.mailbox.id)]).get(), 0)
        self.mailbox.refresh_from_db()
        self.assertEqual((self.mailbox.last_uid, self.mailbox.last_error), (2, ''))
        self.assertTrue(server.logged_out)

    def test_server_errors_are_shown_in_mailbox_settings(self):
        with patch('product.mail.services.imap_connection', side_effect=OSError('connection refused')):
            poll_mailbox.apply(args=[str(self.mailbox.id)])
        self.assertIn('connection refused', Mailbox.objects.get().last_error)


class InboxTests(MailTestCase):
    def test_folders_filters_counts_and_reading(self):
        services.ingest(self.clinic, raw_email(sender='laila@example.com', subject='From patient'))
        services.ingest(self.clinic, raw_email(sender='lab@lab.example', subject='From lab'))
        self.send_results()
        inbox = self.client.get('/api/product/mail/threads/').data
        self.assertEqual(sorted(t['subject'] for t in inbox), ['From lab', 'From patient'])
        self.assertEqual([t['subject'] for t in self.client.get('/api/product/mail/threads/', {'filter': 'unmatched'}).data],
                         ['From lab'])
        self.assertEqual(len(self.client.get('/api/product/mail/threads/', {'folder': 'sent'}).data), 1)
        self.assertEqual(self.client.get('/api/product/mail/threads/counts/').data, {'unread': 2, 'unmatched': 1})
        opened = self.client.get(f'/api/product/mail/threads/{inbox[0]["id"]}/').data
        self.assertFalse(opened['unread'])
        self.assertEqual(self.client.get('/api/product/mail/threads/counts/').data['unread'], 1)

    def test_doctor_replies_in_the_thread_staff_cannot(self):
        message = services.ingest(self.clinic, raw_email(sender='laila@example.com', subject='Old files'))
        url = f'/api/product/mail/threads/{message.thread_id}/reply/'
        document = store_document(organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='letter',
                                  upload=SimpleUploadedFile('l.pdf', PDF, content_type='application/pdf'))
        with patch('product.mail.views.send_thread_reply.delay') as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(url, {'body': 'Please send your old reports.', 'documents': [str(document.id)]},
                                        format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        queued = MailMessage.objects.get(direction='out')
        delay.assert_called_once_with(str(queued.id))
        send_thread_reply.apply(args=[str(queued.id)])
        sent = mail.outbox[-1]
        self.assertEqual((sent.subject, sent.extra_headers['In-Reply-To']), ('Re: Old files', message.message_id))
        self.assertEqual([name for name, *_ in sent.attachments], ['l.pdf'])

        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(url, {'body': 'x'}, format='json').status_code, status.HTTP_403_FORBIDDEN)
