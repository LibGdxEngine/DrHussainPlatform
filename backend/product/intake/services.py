"""Patient form links: issuing, sending, verifying and submitting."""
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.formats import date_format

from .models import MRS_ITEMS, IntakeForm

LINK_LIFETIME = timedelta(days=21)
SESSION_MAX_AGE = 2 * 60 * 60
MAX_FAILED_ATTEMPTS = 5
_SESSION_SALT = 'product.intake.session'


class NoRecipient(Exception):
    """The patient has no email address to send the link to."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def link_for(token: str) -> str:
    # The token sits in the fragment, so it never reaches a server log or a Referer header.
    return f'{settings.EMR_PUBLIC_URL}/emr/intake#t={token}'


def _new_token(form: IntakeForm) -> str:
    token = secrets.token_urlsafe(32)
    form.token_hash = _hash(token)
    form.expires_at = timezone.now() + LINK_LIFETIME
    return token


def issue_form(organization, patient, kind: str, *, appointment=None, created_by=None,
               delivery: str = '') -> tuple[IntakeForm, str]:
    """
    The open form for this visit, with a fresh link. Re-issuing keeps the answers and stops the
    old link working. A completed form is never reopened: a new one is started instead. With a
    delivery, the link is recorded as handed out that way.
    """
    form = None
    if appointment is not None:
        form = (IntakeForm.objects.filter(organization=organization, appointment=appointment)
                .exclude(status=IntakeForm.Status.COMPLETE).first())
    if form is None:
        form = IntakeForm(organization=organization, patient=patient, appointment=appointment, kind=kind,
                          created_by=created_by)
    elif form.status == IntakeForm.Status.LOCKED:
        form.status = IntakeForm.Status.IN_PROGRESS if form.answers or form.mrs else IntakeForm.Status.NOT_STARTED
        form.failed_attempts = 0
    token = _new_token(form)
    if delivery:
        form.sent_at, form.sent_via = timezone.now(), delivery
    form.save()
    return form, token


def rotate_link(form: IntakeForm, *, delivery: str) -> str:
    token = _new_token(form)
    if form.status == IntakeForm.Status.LOCKED:
        form.status = IntakeForm.Status.IN_PROGRESS if form.answers or form.mrs else IntakeForm.Status.NOT_STARTED
        form.failed_attempts = 0
    form.sent_at, form.sent_via = timezone.now(), delivery
    form.save(update_fields=['token_hash', 'expires_at', 'status', 'failed_attempts', 'sent_at', 'sent_via',
                             'updated_at'])
    return token


def clinic_name(organization) -> str:
    from product.content.models import ClinicProfile

    profile = ClinicProfile.objects.filter(organization=organization).first()
    return (profile.display_name if profile else '') or organization.name


def _message(form: IntakeForm, link: str) -> tuple[str, str]:
    clinic = clinic_name(form.organization)
    when = ''
    if form.appointment is not None:
        local = timezone.localtime(form.appointment.starts_at)
        when = f'{date_format(local, "l j F")} at {local:%H:%M}'
    first_name = form.patient.full_name.split(' ')[0]
    if form.patient.preferred_language == 'ar':
        subject = f'{clinic}: استمارة ما قبل الزيارة'
        visit = f' قبل زيارتك يوم {when}' if when else ''
        body = (f'مرحباً {first_name}،\n\nيرجى ملء الاستمارة{visit}. تستغرق حوالي 10 دقائق، ويمكنك الحفظ والإكمال لاحقاً:\n'
                f'{link}\n\nالرابط خاص بك فقط. سنطلب تاريخ ميلادك قبل فتح الاستمارة.\n\n{clinic}')
    else:
        subject = f'{clinic}: your form before your visit'
        visit = f' before your visit on {when}' if when else ''
        body = (f'Hello {first_name},\n\nPlease complete your form{visit}. It takes about 10 minutes, and you can '
                f'save and finish later:\n{link}\n\nThis link is for you only. We will ask for your date of birth '
                f'before the form opens.\n\nIf you have old test results or reports, reply to this email with them '
                f'or bring them with you.\n\n{clinic}')
    return subject, body


def send_by_email(form: IntakeForm, *, sent_by) -> str:
    """Email a fresh link through the clinic's own mail server. Raises NoRecipient or MailboxNotReady."""
    from product.mail.outbox import queue_email
    from product.mail.transport import outgoing

    address = form.patient.email
    if not address:
        raise NoRecipient('This patient has no email address. Copy the link and send it another way.')
    outgoing(form.organization)  # fail before the old link is replaced
    with transaction.atomic():
        token = rotate_link(form, delivery=IntakeForm.Delivery.EMAIL)
        subject, body = _message(form, link_for(token))
        queue_email(form.organization, to_address=address, subject=subject, body=body, patient=form.patient,
                    sent_by=sent_by)
    return token


# --- The patient's side ---------------------------------------------------------------------------

class LinkInvalid(Exception):
    """Unknown, expired or locked link."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def form_for_token(token: str) -> IntakeForm:
    form = (IntakeForm.objects.select_related('patient', 'organization', 'appointment')
            .filter(token_hash=_hash(token or '')).first())
    if form is None or form.expires_at <= timezone.now():
        raise LinkInvalid('LINK_INVALID', 'This link has expired or was replaced. Ask the clinic for a new one.')
    if form.status == IntakeForm.Status.LOCKED:
        raise LinkInvalid('LINK_LOCKED', 'This link is locked after too many tries. Ask the clinic for a new one.')
    return form


def verify(form: IntakeForm, date_of_birth) -> str | None:
    """A session for the form when the date of birth matches; None (and one more strike) otherwise."""
    if date_of_birth != form.patient.date_of_birth:
        form.failed_attempts += 1
        if form.failed_attempts >= MAX_FAILED_ATTEMPTS:
            form.status = IntakeForm.Status.LOCKED
        form.save(update_fields=['failed_attempts', 'status', 'updated_at'])
        return None
    form.failed_attempts = 0
    form.verified_at = timezone.now()
    form.save(update_fields=['failed_attempts', 'verified_at', 'updated_at'])
    # Bound to the current token: a re-sent link ends sessions opened with the old one.
    return signing.dumps({'f': str(form.pk), 't': form.token_hash[:16]}, salt=_SESSION_SALT)


def form_for_session(session: str) -> IntakeForm:
    try:
        data = signing.loads(session or '', salt=_SESSION_SALT, max_age=SESSION_MAX_AGE)
    except signing.BadSignature:
        raise LinkInvalid('SESSION_EXPIRED', 'Your session has ended. Open the link again to continue.')
    form = (IntakeForm.objects.select_related('patient', 'organization', 'appointment')
            .filter(pk=data.get('f')).first())
    if form is None or form.token_hash[:16] != data.get('t') or form.expires_at <= timezone.now():
        raise LinkInvalid('SESSION_EXPIRED', 'Your session has ended. Open the link again to continue.')
    if form.status == IntakeForm.Status.LOCKED:
        raise LinkInvalid('LINK_LOCKED', 'This link is locked after too many tries. Ask the clinic for a new one.')
    return form


def save_answers(form: IntakeForm, answers: dict, mrs: list[int] | None, *, submit: bool) -> IntakeForm:
    form.answers = answers
    if mrs is not None:
        form.mrs = mrs
    if submit:
        form.status = IntakeForm.Status.COMPLETE
        form.submitted_at = timezone.now()
        form.mrs_total = sum(form.mrs) if form.mrs and len(form.mrs) == MRS_ITEMS else None
    elif form.status == IntakeForm.Status.NOT_STARTED:
        form.status = IntakeForm.Status.IN_PROGRESS
    form.save()
    return form
