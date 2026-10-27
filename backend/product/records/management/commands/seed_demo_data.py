"""
Fill a development clinic with a believable demo: patients, lab and pathology PDFs read by the real
pipeline, drafts waiting for the doctor, sent history, an inbox, clinic content and an audit trail.

Everything goes through the same services the screens use (reading, routing, drafting, mail ingest),
so what the demo shows is what the platform does. Wording, prescriptions and leaflets are sample text
for presentations, not clinical content.

    python manage.py seed_demo_data
"""
import hashlib
from datetime import date, datetime, time, timedelta
from email.message import EmailMessage
from email.utils import format_datetime

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember

PASSWORD_HINT = 'admin12345'


# --- A tiny PDF writer: one page of plain text, enough for the report reader ------------------------

def make_pdf(lines: list[str]) -> bytes:
    def escape(text: str) -> str:
        return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    stream = ['BT', '/F1 11 Tf', '15 TL', '50 800 Td']
    stream += [f'({escape(line)}) Tj T*' for line in lines]
    stream.append('ET')
    content = '\n'.join(stream).encode('latin-1', 'replace')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R '
        b'/Resources << /Font << /F1 4 0 R >> >> >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream',
    ]
    out, offsets = bytearray(b'%PDF-1.4\n'), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % number + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for offset in offsets:
        out += b'%010d 00000 n \n' % offset
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref)
    return bytes(out)


def report_lines(*, lab, name, dob, file_number, collected, heading, rows=(), body=()):
    lines = [lab, heading, '', f'Patient Name: {name}', f'Date of Birth: {dob:%d/%m/%Y}', f'File No: {file_number}',
             f'Collected on: {collected:%d/%m/%Y}', '']
    lines += list(rows)
    if body:
        lines += ['', *body]
    lines += ['', 'End of report.']
    return lines


# --- Clinic wording: sample text so drafts can be built, to be replaced by the doctor's own ---------

SIGN_OFF = '\n\nIf you would like to talk this through, phone {{clinic.phone}} to book.'
WORDING = {
    'results': ('Your test results',
                'Dear {{patient.first_name}},\n\nThank you for sending your results from {{report.lab}} (sample taken '
                '{{report.date}}). Here they are:\n\n{{results.table}}\n\nI have looked through them and they do not '
                'need any urgent action.' + SIGN_OFF),
    'menopause_results': ('Your blood test results',
                          'Dear {{patient.first_name}},\n\nYour hormone and blood tests from {{report.date}} are back:'
                          '\n\n{{results.table}}\n\nThese help us choose the right plan for you. Please phone '
                          '{{clinic.phone}} to book a consultation to go through them together.'),
    'follow_up_comparison': ('Your follow-up results',
                             'Dear {{patient.first_name}},\n\nHere is how your latest results compare with your '
                             'previous ones:\n\n{{comparison.table}}\n\nThe treatment is doing what we hoped, apart '
                             'from the points marked above, which we will discuss.' + SIGN_OFF),
    'pathology_results': ('Your pathology results',
                          'Dear {{patient.first_name}},\n\nYour pathology report from {{report.date}} has arrived. '
                          '[[summary of the finding]]\n\nNext step: [[next step]].' + SIGN_OFF),
    'sti_opening': ('Your swab results',
                    'Dear {{patient.first_name}},\n\nThank you for sending your swab results ({{report.date}}):\n\n'
                    '{{results.table}}'),
    'sti_closing': (None,
                    'Please avoid intimate contact until you have finished treatment, and we will arrange a repeat '
                    'test to confirm it has cleared.' + SIGN_OFF),
    'smear_section_1': ('Your smear result',
                        'Dear {{patient.first_name}},\n\nYour cervical smear is normal. Your next smear is due in '
                        '[[repeat interval]].\n\nNo further action is needed now.'),
    'prescription_reply': ('Re: your prescription',
                           'Dear {{patient.first_name}},\n\nThank you for your message:\n\n> {{patient.question}}\n\n'
                           'Your current prescription:\n{{prescription}}\n\n[[answer to the patient\'s question]]'),
}
STI_SECTION = ('{{result.name}}: {{result.value}}.\n\nThis is common and very treatable. Your treatment: '
               '{{prescription}}')
SMEAR_SECTION = ('Dear {{patient.first_name}},\n\nYour cervical smear showed a change that needs a short follow-up '
                 'visit. {{results.abnormal}}\n\nPlease phone {{clinic.phone}} to book a colposcopy appointment.')
ARABIC_RESULTS = ('نتائج التحاليل',
                  'عزيزتي {{patient.first_name}}،\n\nشكراً لإرسال نتائجك من {{report.lab}} (تاريخ العينة '
                  '{{report.date}}):\n\n{{results.table}}\n\nراجعتُ النتائج وهي لا تحتاج إلى إجراء عاجل. '
                  'للاستفسار اتصلي بالعيادة على {{clinic.phone}}.')

PRESCRIPTIONS = [
    ('Estradiol gel 0.06%', '2 pumps once daily', 'Apply to clean, dry skin on the upper arms or thighs. Rotate sites.'),
    ('Micronised progesterone 100 mg', '1 capsule at night', 'Take for the last 12 days of each month, at bedtime.'),
    ('Vaginal estradiol 10 mcg', '1 pessary nightly for 2 weeks, then twice a week', 'Insert at bedtime.'),
    ('Testosterone gel 1%', '1/4 sachet daily', 'Apply to the lower abdomen. Wash hands afterwards.'),
    ('Doxycycline 100 mg', '1 capsule twice daily for 7 days', 'Take with water and food; avoid direct sun.'),
]
LEAFLETS = [
    ('Starting HRT: what to expect', ['Starting HRT: what to expect', '', 'Sample leaflet for demonstration.',
                                      'Most side effects settle within the first 3 months.']),
    ('After your swab: avoiding re-infection', ['After your swab: avoiding re-infection', '',
                                                'Sample leaflet for demonstration.']),
]


def seed_examinations(patients, doctor, today):
    """
    Laila: a normal examination three months ago and one this week with high blood pressure, BMI and
    waist (R20, R21, R22 amber). Yasmin: a normal one. Saved like the exam screen saves them, alerts included.
    """
    from product.alerts.services import evaluate_patient
    from product.records.models import Examination, ExaminationRevision

    specs = [
        ('laila', 92, dict(bp1_systolic=128, bp1_diastolic=82, height_cm=162, weight_kg=78, waist_cm=86,
                           breast_exam='Done. No masses, no skin changes.', pelvic_exam='Done. Normal cervix.',
                           screening={'smear': True, 'mood': True}, plan='investigate',
                           plan_notes='Hormone profile and baseline bloods before treatment.')),
        ('laila', 5, dict(bp1_systolic=144, bp1_diastolic=92, bp2_systolic=138, bp2_diastolic=88, height_cm=162,
                          weight_kg=81, waist_cm=91, breast_exam='Done. No masses, no skin changes, no nipple discharge.',
                          pelvic_exam='Done. Atrophic vaginal mucosa, normal cervix, no active bleeding. Swabs taken.',
                          screening={'smear': True, 'mood': True}, plan='start',
                          plan_notes='Recheck blood pressure in 2 weeks before starting HRT. Transdermal route.',
                          next_review=today + timedelta(days=90), send_follow_up_form=True)),
        ('yasmin', 3, dict(bp1_systolic=112, bp1_diastolic=70, height_cm=165, weight_kg=58, waist_cm=72,
                           pelvic_exam='Not done today.', screening={'contraception': True}, plan='investigate',
                           plan_notes='Iron studies repeated; heavy periods diary.')),
    ]
    for key, days_ago, fields in specs:
        patient = patients[key]
        exam = Examination.objects.create(organization=patient.organization, patient=patient, created_by=doctor,
                                          examined_on=today - timedelta(days=days_ago), **fields)
        exam.refresh_from_db()  # decimals as stored, for the revision snapshot
        ExaminationRevision.objects.create(examination=exam, number=1, author=doctor, data=exam.snapshot())
        evaluate_patient(patient)


class Command(BaseCommand):
    help = 'Fill the development clinic with demo patients, reports, drafts, an inbox and an audit trail.'

    def add_arguments(self, parser):
        parser.add_argument('--org', default='', help='Clinic slug. Defaults to the first clinic.')
        parser.add_argument('--user', default='admin@vclinic.local', help='Doctor (clinic owner) to act as.')

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Demo data is for development only (DEBUG is off).')
        organization = (Organization.objects.filter(slug=options['org']) if options['org']
                        else Organization.objects.order_by('created_at')).first()
        if organization is None:
            raise CommandError('There is no clinic yet. Run scripts/seed_dev_data.py first.')
        admin = User.objects.filter(email=options['user']).first()
        if admin is None or not OrganizationMember.objects.filter(organization=organization, user=admin).exists():
            raise CommandError(f'{options["user"]} is not a member of {organization.name}.')
        from product.patients.models import Patient

        if Patient.objects.filter(organization=organization).exists():
            self.stdout.write(self.style.WARNING(f'{organization.name} already has patients; nothing was added.'))
            return
        self.org, self.admin, self.today = organization, admin, date.today()
        self.now = timezone.now()
        self.stdout.write(f'Seeding demo data into {organization.name}...')
        self.content()
        self.patients()
        self.reports()
        self.history()
        self.examinations()
        self.inbox()
        self.audit()
        self.summary()

    # --- Clinic content ---------------------------------------------------------------------------

    def content(self):
        from product.content.models import (
            ClinicProfile, EmailTemplate, EmailTemplateVersion, Leaflet, LeafletVersion, PrescriptionItem,
            PrescriptionVersion, AlertRule, AlertRuleVersion, TemplateKind,
        )
        from product.content.placeholders import validate_text
        from product.content.versioning import add_version
        from product.mail.models import Mailbox, Security
        from product.onboarding import onboard_clinic

        onboard_clinic(self.org)
        ClinicProfile.objects.update_or_create(organization=self.org, defaults=dict(
            display_name='V-Clinic', phone='+20 100 555 0142', doctor_name='Dr Hussain Gohar',
            signature='Kind regards,\nDr Hussain Gohar\nV-Clinic'))

        def approve(template, subject, body):
            for text in (subject or '', body):
                problems = validate_text(text)
                if problems:
                    raise CommandError(f'Demo wording for {template.key} is invalid: {problems}')
            version, _ = add_version(template, EmailTemplateVersion, {'subject': subject or '', 'body': body},
                                     user=self.admin, note='Demo wording')
            EmailTemplateVersion.objects.filter(pk=version.pk).update(approved_by=self.admin, approved_at=self.now)

        for template in EmailTemplate.objects.filter(organization=self.org, language='en'):
            if template.key in WORDING:
                approve(template, *WORDING[template.key])
            elif template.key.startswith('sti_section_'):
                approve(template, None, STI_SECTION)
            elif template.key.startswith('smear_section_'):
                approve(template, 'Your smear result', SMEAR_SECTION)
        arabic, _ = EmailTemplate.objects.get_or_create(
            organization=self.org, key='results', language='ar',
            defaults=dict(name='Results email (Arabic)', kind=TemplateKind.RESULTS))
        approve(arabic, *ARABIC_RESULTS)

        self.prescriptions = []
        for position, (drug, dose, directions) in enumerate(PRESCRIPTIONS, start=1):
            item = PrescriptionItem.objects.create(organization=self.org, sort_order=position * 10)
            self.prescriptions.append(PrescriptionVersion.objects.create(
                item=item, number=1, drug=drug, dose=dose, directions=directions, note='Demo', created_by=self.admin))
        leaflets = []
        for title, lines in LEAFLETS:
            leaflet = Leaflet.objects.create(organization=self.org, title=title)
            pdf = make_pdf(lines)
            version = LeafletVersion(leaflet=leaflet, number=1, original_filename=title.lower().replace(' ', '-') + '.pdf',
                                     size=len(pdf), sha256=hashlib.sha256(pdf).hexdigest(), created_by=self.admin,
                                     note='Demo')
            version.file.save(version.original_filename, ContentFile(pdf), save=False)
            version.save()
            leaflets.append(leaflet)
        EmailTemplate.objects.get(organization=self.org, key='menopause_results', language='en').default_leaflets.add(leaflets[0])
        EmailTemplate.objects.get(organization=self.org, key='sti_closing', language='en').default_leaflets.add(leaflets[1])

        # A red lab rule so the "red alert goes to the doctor first" flow can be shown.
        rule = AlertRule.objects.create(organization=self.org, code='R41', sort_order=410)
        AlertRuleVersion.objects.create(
            rule=rule, number=1, field='Ferritin (labs)', pre='<', threshold_a='15', mid='ng/mL', level='red',
            message='Severe iron deficiency: same-day call', lab_test_code='ferritin', lab_check='lt',
            note='Demo rule', created_by=self.admin)

        mailbox, _ = Mailbox.objects.get_or_create(organization=self.org, defaults=dict(address='clinic@vclinic.test'))
        mailbox.address, mailbox.display_name, mailbox.enabled = 'clinic@vclinic.test', 'V-Clinic', True
        mailbox.smtp_host, mailbox.smtp_port, mailbox.smtp_security = 'mailserver', 3025, Security.NONE
        mailbox.imap_host, mailbox.imap_port, mailbox.imap_security = 'mailserver', 3143, Security.NONE
        mailbox.smtp_username = mailbox.imap_username = 'clinic@vclinic.test'
        mailbox.smtp_password = mailbox.imap_password = 'demo'
        mailbox.last_synced_at = self.now
        mailbox.save()
        self.mailbox = mailbox

    # --- Patients and documents -------------------------------------------------------------------

    def patients(self):
        from product.patients.services import create_patient

        specs = [
            ('laila', 'Laila Ahmed', 'ليلى أحمد', date(1974, 3, 12), 'whatsapp', 'en', 'Dr Samir Nabil'),
            ('mona', 'Mona Hassan', 'منى حسن', date(1981, 7, 22), 'email', 'en', ''),
            ('sara', 'Sara Mahmoud', 'سارة محمود', date(1969, 11, 2), 'phone', 'en', ''),
            ('nadia', 'Nadia Farouk', 'نادية فاروق', date(1977, 5, 30), 'whatsapp', 'ar', 'Dr Ahmed Fathy'),
            ('heba', 'Heba Samir', 'هبة سمير', date(1988, 1, 18), 'whatsapp', 'ar', ''),
            ('amira', 'Amira Khalil', 'أميرة خليل', date(1965, 9, 9), 'walkin', 'en', 'Dr Ahmed Fathy'),
            ('dalia', 'Dalia Youssef', 'داليا يوسف', date(1972, 2, 14), 'email', 'en', ''),
            ('rania', 'Rania Adel', 'رانيا عادل', date(1960, 12, 5), 'phone', 'en', ''),
            ('yasmin', 'Yasmin Tarek', 'ياسمين طارق', date(1990, 4, 4), 'whatsapp', 'en', ''),
        ]
        self.p = {}
        for number, (key, name, name_ar, dob, channel, language, referrer) in enumerate(specs, start=1):
            self.p[key] = create_patient(
                self.org, full_name=name, full_name_ar=name_ar, date_of_birth=dob,
                mobile=f'+2010055500{number:02d}', whatsapp=f'+2010055500{number:02d}',
                email=f'{name.lower().replace(" ", ".")}@example.test', referring_doctor=referrer,
                first_contact_channel=channel, preferred_language=language)

        from product.records.models import Diagnosis, DiagnosisRevision

        diagnoses = [
            ('laila', 'Perimenopause', 'confirmed', 'Vasomotor symptoms, irregular cycles since 2025.'),
            ('mona', 'Vitamin D insufficiency', 'resolved', 'Normal after 3 months of supplements.'),
            ('nadia', 'Cervical cytology: ASC-US', 'suspected', 'HPV test and colposcopy to be arranged.'),
            ('amira', 'Endometrial polyp', 'confirmed', 'Hysteroscopy and biopsy done.'),
            ('rania', 'Hypothyroidism', 'confirmed', 'On levothyroxine; TSH checked every 6 months.'),
            ('yasmin', 'Iron deficiency anaemia', 'suspected', 'Heavy periods; awaiting repeat bloods.'),
        ]
        for key, name, status, notes in diagnoses:
            diagnosis = Diagnosis.objects.create(
                organization=self.org, patient=self.p[key], name=name, status=status, notes=notes,
                noted_on=self.today - timedelta(days=40), created_by=self.admin)
            DiagnosisRevision.objects.create(diagnosis=diagnosis, number=1, name=name, status=status,
                                             noted_on=diagnosis.noted_on, notes=notes, author=self.admin)

        self.upload('laila', 'us', 'Pelvic ultrasound', ['Pelvic ultrasound', 'Normal uterus and ovaries.'], 70, 'clinic_scan')
        self.upload('amira', 'rad', 'Mammogram', ['Mammogram', 'No suspicious findings.'], 200, 'patient')
        self.upload('rania', 'paper', 'Old paper notes, 2019', ['Scanned paper notes 2019'], 2000, 'bulk_scan')
        self.upload('nadia', 'letter', 'Referral letter from GP', ['Referral letter', 'Please see for abnormal smear.'], 20, 'email')
        self.upload('mona', 'lab', 'Vitamin D (brought by patient)', None, 150, 'patient', read=False)

    def upload(self, key, slot, title, lines, days_ago, source, read=True):
        from product.records.services import store_document

        collected = self.today - timedelta(days=days_ago)
        pdf = make_pdf(lines or ['Vitamin D 25-OH   14 ng/mL'])
        upload = SimpleUploadedFile(f'{title.lower().replace(" ", "-").replace(",", "")}.pdf', pdf,
                                    content_type='application/pdf')
        return store_document(organization=self.org, patient=self.p[key], upload=upload, uploaded_by=self.admin,
                              slot=slot, title=title, document_date=collected, source=source)

    # --- Reports, read by the real pipeline ---------------------------------------------------------

    def report(self, key, *, days_ago, heading, rows=(), body=(), slot='lab', dob=None, lab='Delta Diagnostics Laboratory'):
        from product.results.pipeline import process_document
        from product.review.services import route_report

        patient, collected = self.p[key], self.today - timedelta(days=days_ago)
        lines = report_lines(lab=lab, name=patient.full_name, dob=dob or patient.date_of_birth,
                             file_number=patient.file_number, collected=collected, heading=heading, rows=rows, body=body)
        document = self.upload(key, slot, f'{heading} ({collected:%d %b %Y})', lines, days_ago, 'upload')
        report = process_document(document)
        return report, route_report(report)

    def reports(self):
        menopause_rows = lambda fsh, lh, e2, tsh, ferritin, t: [
            f'FSH {fsh} mIU/mL (25.8 - 134.8)', f'LH {lh} mIU/mL (7.7 - 58.5)', f'Estradiol {e2} pg/mL (12.5 - 166)',
            f'TSH {tsh} mIU/L (0.4 - 4.0)', f'Ferritin {ferritin} ng/mL (13 - 150)', f'Testosterone {t} ng/dL (8 - 48)']
        self.cases = {}
        self.cases['laila_1'] = self.report('laila', days_ago=95, heading='Hormone profile', rows=menopause_rows(48, 31, 22, 2.9, 21, 38))
        self.cases['laila_2'] = self.report('laila', days_ago=6, heading='Hormone profile', rows=menopause_rows(62, 40, 18, 2.2, 32, 62))
        self.cases['mona'] = self.report('mona', days_ago=4, heading='Blood tests', rows=[
            'Ferritin 78 ng/mL (13 - 150)', 'TSH 1.8 mIU/L (0.4 - 4.0)', 'HbA1c 5.2 % (4.0 - 5.6)',
            'Vitamin D 34 ng/mL (30 - 100)', 'Haemoglobin 13.1 g/dL (12.0 - 15.5)'])
        self.cases['sara'] = self.report('sara', days_ago=3, heading='High vaginal swab - STI screen', rows=[
            'Chlamydia trachomatis PCR Detected', 'Neisseria gonorrhoeae PCR Not detected',
            'Trichomonas vaginalis PCR Not detected', 'Candida Not detected'])
        self.cases['nadia'] = self.report('nadia', days_ago=5, heading='Cervical cytology - liquid based cytology', body=[
            'Specimen adequate for evaluation.', 'Interpretation: ASC-US (atypical squamous cells of undetermined significance).',
            'HPV testing is recommended.'])
        self.cases['heba'] = self.report('heba', days_ago=2, heading='Cervical cytology - liquid based cytology', body=[
            'Specimen adequate for evaluation.', 'Interpretation: Negative for intraepithelial lesion (NILM).'])
        self.cases['amira'] = self.report('amira', days_ago=7, slot='path', heading='Histopathology report', body=[
            'Specimen received: endometrial biopsy.', 'Macroscopic description: three tan fragments, 1.2 cm aggregate.',
            'Microscopic description: benign endometrial polyp. No atypia or malignancy seen.'])
        self.cases['dalia'] = self.report('dalia', days_ago=1, heading='Blood tests', dob=date(1972, 2, 15), rows=[
            'TSH 6.8 mIU/L (0.4 - 4.0)', 'Ferritin 40 ng/mL (13 - 150)'])
        self.cases['rania'] = self.report('rania', days_ago=60, heading='Blood tests', rows=[
            'TSH 2.4 mIU/L (0.4 - 4.0)', 'Haemoglobin 13.4 g/dL (12.0 - 15.5)', 'Ferritin 66 ng/mL (13 - 150)'])
        self.cases['yasmin'] = self.report('yasmin', days_ago=2, heading='Blood tests', rows=[
            'Ferritin 9 ng/mL (13 - 150)', 'Haemoglobin 10.4 g/dL (12.0 - 15.5)', 'Vitamin D 18 ng/mL (30 - 100)'])

    # --- Sent history and alerts ------------------------------------------------------------------------

    def history(self):
        from product.alerts.models import PatientAlert
        from product.alerts.services import acknowledge
        from product.mail.services import record_outgoing
        from product.review.models import ResultsCase, ReviewAction, SentEmail

        def mark_sent(case_key, days_ago, message_id, prescriptions=()):
            report, case = self.cases[case_key]
            draft = case.current_draft
            if draft is None:
                return
            if prescriptions:
                draft.prescriptions.set(prescriptions)
            sent_at = self.now - timedelta(days=days_ago)
            patient = case.patient
            sent = SentEmail.objects.create(
                case=case, draft=draft, to_address=patient.email, from_address=self.mailbox.address,
                subject=draft.subject, body=draft.body, status=SentEmail.Status.SENT, message_id=message_id,
                approved_by=self.admin, sent_at=sent_at)
            case.status = ResultsCase.Status.SENT
            case.save(update_fields=['status', 'updated_at'])
            for action in (ReviewAction.Action.APPROVED, ReviewAction.Action.SENT):
                row = ReviewAction.objects.create(case=case, action=action, actor=self.admin)
                ReviewAction.objects.filter(pk=row.pk).update(created_at=sent_at)
            message = record_outgoing(
                self.org, message_id=message_id, subject=draft.subject, body=draft.body,
                from_address=f'V-Clinic <{self.mailbox.address}>', to_addresses=[patient.email], patient=patient,
                sent_email=sent, sent_by=self.admin)
            message.thread.__class__.objects.filter(pk=message.thread_id).update(last_message_at=sent_at)
            type(message).objects.filter(pk=message.pk).update(sent_at=sent_at)

        # A pathology report has no numeric rows, so it always reaches the doctor flagged. She chose to
        # draft anyway, which leaves open blanks for her to fill before it can be sent.
        from product.review.services import rebuild

        _, pathology_case = self.cases['amira']
        rebuild(pathology_case, user=self.admin, ignore_flags=True)
        ReviewAction.objects.create(case=pathology_case, action=ReviewAction.Action.DRAFTED_ANYWAY, actor=self.admin)

        mark_sent('laila_1', 90, '<demo-laila-1@vclinic.test>')
        mark_sent('rania', 55, '<demo-rania-1@vclinic.test>', prescriptions=[self.prescriptions[0], self.prescriptions[1]])
        for alert in PatientAlert.objects.filter(patient=self.p['rania'], status='open'):
            acknowledge(alert, user=self.admin, reason='Lipoprotein(a) discussed at the last visit; will order with next bloods.')

    # --- Examinations -------------------------------------------------------------------------------

    def examinations(self):
        seed_examinations(self.p, self.admin, self.today)

    # --- Inbox ---------------------------------------------------------------------------------------

    def inbox(self):
        from product.mail.services import ingest

        def send(*, name, address, subject, body, days_ago, hours=10, in_reply_to='', attachment=None):
            message = EmailMessage()
            message['From'] = f'{name} <{address}>'
            message['To'] = f'V-Clinic <{self.mailbox.address}>'
            message['Subject'] = subject
            when = timezone.make_aware(datetime.combine(self.today - timedelta(days=days_ago), time(hours, 12)))
            message['Date'] = format_datetime(when)
            message['Message-ID'] = f'<demo-in-{hashlib.sha1((address + subject).encode()).hexdigest()[:12]}@example.test>'
            if in_reply_to:
                message['In-Reply-To'] = in_reply_to
                message['References'] = in_reply_to
            message.set_content(body)
            if attachment:
                message.add_attachment(attachment[1], maintype='application', subtype='pdf', filename=attachment[0])
            ingest(self.org, message.as_bytes())

        p = self.p
        send(name=p['laila'].full_name, address=p['laila'].email, days_ago=4, in_reply_to='<demo-laila-1@vclinic.test>',
             subject='Re: Your blood test results', body='Thank you doctor. I will phone the clinic this week to book.')
        send(name=p['rania'].full_name, address=p['rania'].email, days_ago=1, hours=9, in_reply_to='<demo-rania-1@vclinic.test>',
             subject='Re: Your test results',
             body='Dear Doctor,\n\nI have a question about my prescription. Can I take the progesterone capsule '
                  'with food, and is it normal to feel sleepy after the dose?\n\nThank you,\nRania')
        send(name=p['heba'].full_name, address=p['heba'].email, days_ago=0, hours=8,
             subject='سؤال عن الدواء', body='السلام عليكم دكتور، عندي سؤال عن الدواء الذي وصفته لي، هل أتناوله مع الطعام؟')
        send(name=p['mona'].full_name, address=p['mona'].email, days_ago=2, subject='My vitamin D result',
             body='Please find my vitamin D result attached.', attachment=('vitamin-d-result.pdf', make_pdf(['Vitamin D 25-OH   14 ng/mL'])))
        send(name='Faisal Khalil', address='faisal.k@example.test', days_ago=0, hours=11,
             subject='Results for my wife', body=f'Hello, I am writing for my wife, file {p["sara"].file_number}. '
                                                  'Could you send her results again?')

    # --- Audit trail ---------------------------------------------------------------------------------

    def audit(self):
        org_id, p = str(self.org.pk), self.p
        entries = [
            ('auth.signin', 'accounts.user', self.admin.pk, {}, 70, self.admin),
            ('patient.searched', 'patients.patient', None, {'query': 'laila'}, 69, self.admin),
            ('patient.opened', 'patients.patient', p['laila'].pk, {'patient_id': str(p['laila'].pk)}, 68, self.admin),
            ('document.uploaded', 'records.document', None, {'slot': 'lab', 'patient_id': str(p['laila'].pk)}, 66, self.admin),
            ('review_case.approved', 'review.resultscase', None, {'patient_id': str(p['laila'].pk)}, 64, self.admin),
            ('patient_alert.opened', 'alerts.patientalert', None, {'patient_id': str(p['laila'].pk), 'code': 'R34'}, 30, self.admin),
            ('document.opened', 'records.document', None, {'patient_id': str(p['amira'].pk)}, 28, self.admin),
            ('mail_thread.replied', 'mail.mailthread', None, {'patient_id': str(p['rania'].pk)}, 26, self.admin),
            ('auth.signin', 'accounts.user', self.admin.pk, {}, 24, self.admin),
            ('patient.created', 'patients.patient', p['yasmin'].pk, {'patient_id': str(p['yasmin'].pk)}, 22, self.admin),
            ('template.version_saved', 'content.emailtemplate', None, {'template': 'results', 'version': 2}, 20, self.admin),
            ('access.denied', 'patients.patient', None, {'path': '/api/product/patients/'}, 18, None),
            ('auth.signin_failed', 'accounts.user', None, {'identifier': self.admin.email}, 12, None),
            ('auth.signin', 'accounts.user', self.admin.pk, {}, 6, self.admin),
            ('patient.searched', 'patients.patient', None, {'query': 'ليلى'}, 5, self.admin),
            ('patient_alert.opened', 'alerts.patientalert', None, {'patient_id': str(p['yasmin'].pk), 'code': 'R41'}, 2, self.admin),
        ]
        for action, resource_type, resource_id, metadata, hours_ago, actor in entries:
            row = AuditLog.objects.create(
                actor=actor, action=action, resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else '', ip_address='127.0.0.1',
                metadata={'organization_id': org_id, **metadata})
            AuditLog.objects.filter(pk=row.pk).update(created_at=self.now - timedelta(hours=hours_ago))

    def summary(self):
        self.stdout.write('')
        for key, (report, case) in self.cases.items():
            self.stdout.write(f'  {key:10} report={report.status:9} type={report.report_type:18} '
                              f'case={(case.status if case else "-"):13} flags={case.flag_reasons if case else []}')
        from product.mail.models import MailThread

        self.stdout.write(f'  inbox threads: {MailThread.objects.filter(organization=self.org).count()}')
        self.stdout.write(self.style.SUCCESS(
            f'Demo data ready. Sign in as {self.admin.email} (dev password: {PASSWORD_HINT}).'))
