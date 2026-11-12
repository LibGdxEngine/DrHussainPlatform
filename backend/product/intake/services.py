"""Patient form links: issuing, sending, verifying and submitting."""
import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.formats import date_format

from .catalogue import (
    CATALOGUE_VERSION, QUESTIONS, RULE_LEVELS, SECTION_OF, SECTIONS, is_blank, missing_required, modules_for,
    placement, sections_for, visible_questions,
)
from .history import age_on, patient_history
from .models import MRS_ITEMS, IntakeForm

logger = logging.getLogger(__name__)

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
               delivery: str = '', extra_modules=None) -> tuple[IntakeForm, str]:
    """
    The open form for this visit, with a fresh link. Re-issuing keeps the answers and stops the
    old link working. A completed form is never reopened: a new one is started instead. With a
    delivery, the link is recorded as handed out that way. `extra_modules`, when given, replaces
    the modules added on top of the ones her answers open.
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
    if extra_modules is not None:
        form.extra_modules = list(dict.fromkeys(extra_modules))
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


class AnswersIncomplete(Exception):
    """Shown, required questions were left blank on submit."""

    def __init__(self, fields: list[str]):
        super().__init__('Answer the questions marked before sending.')
        self.fields = fields


def form_age(form: IntakeForm) -> int | None:
    """The patient's age when the form was sent (today for a form still open)."""
    when = timezone.localdate(form.submitted_at) if form.submitted_at else timezone.localdate()
    return age_on(form.patient.date_of_birth, when)


def save_answers(form: IntakeForm, answers: dict, mrs: list[int] | None, *, submit: bool) -> IntakeForm:
    """
    Save the (catalogue-checked) answers. On submit, answers to questions the form did not show are
    dropped, required questions are enforced (AnswersIncomplete), the shown questions and the
    catalogue version are stamped, and the alert rules run once the save has committed.
    """
    if submit:
        age = age_on(form.patient.date_of_birth, timezone.localdate())
        shown = visible_questions(answers, age, form.extra_modules, form.kind)
        answers = {qid: value for qid, value in answers.items() if qid in shown}
        missing = missing_required(answers, age, form.extra_modules, form.kind)
        if missing:
            raise AnswersIncomplete(missing)
        form.shown_questions = [qid for qid in QUESTIONS if qid in shown]
        form.catalogue_version = CATALOGUE_VERSION
    form.answers = answers
    if mrs is not None:
        form.mrs = mrs
    if submit:
        form.status = IntakeForm.Status.COMPLETE
        form.submitted_at = timezone.now()
        form.mrs_total = sum(form.mrs) if form.mrs and len(form.mrs) == MRS_ITEMS else None
    elif form.status == IntakeForm.Status.NOT_STARTED:
        form.status = IntakeForm.Status.IN_PROGRESS
    with transaction.atomic():
        form.save()
        if submit:
            transaction.on_commit(lambda: run_alert_rules(form))
    return form


def run_alert_rules(form: IntakeForm) -> None:
    """
    Check the patient against the alert rules after a submit, then re-route her open results cases
    so a case screen shows a flag this form raised. The safe evaluator records its own errors on the
    form; anything it lets through is logged and recorded here, so a submit never fails because of
    the rules or the re-route.
    """
    try:
        from product.alerts.services import evaluate_patient_safely

        evaluate_patient_safely(form.patient, form)
    except Exception as exc:  # noqa: BLE001 - the answers are saved; the doctor sees the failure
        logger.exception('Alert rules failed after intake form %s was submitted', form.pk)
        errors = [{'rule': 'all', 'error': type(exc).__name__}]
        IntakeForm.objects.filter(pk=form.pk).update(rule_errors=errors, rules_evaluated_at=None)
    try:
        from product.review.services import reroute_open_cases

        reroute_open_cases(form.patient)
    except Exception:  # noqa: BLE001 - the answers are saved; a failed re-route must not fail the submit
        logger.exception('Open cases could not be re-routed after intake form %s was submitted', form.pk)


# --- Reading the answers ---------------------------------------------------------------------------

def previous_answers(patient, *, kind: str = IntakeForm.Kind.FULL) -> dict:
    """Her carry-forward answers from earlier complete forms (the newest answer to each question)."""
    history = patient_history(patient)
    out = {}
    for section in sections_for(kind):
        for question in section['questions']:
            if question['carry_forward']:
                value = history.merged(question['id'])
                if value is not None:
                    out[question['id']] = value
    return out


def _label(spec: dict, value) -> str:
    for option in spec.get('options', []):
        if option['value'] == value:
            return option['label']
    return str(value)


def format_answer(spec: dict, value) -> str:
    """An answer as the doctor reads it, with the catalogue's option labels."""
    qtype = spec['type']
    if qtype == 'multi':
        return ', '.join(_label(spec, v) for v in value)
    if qtype == 'tick':
        return 'Yes' if value else 'No'
    if qtype == 'rows':
        rows = []
        for row in value:
            parts = [format_answer(f, row[f['id']]) for f in spec['fields'] if f['id'] in row and f['type'] != 'tick']
            parts += [f['label'] for f in spec['fields'] if f['type'] == 'tick' and row.get(f['id']) is True]
            rows.append(', '.join(parts))
        return '; '.join(rows)
    if qtype == 'number' and value == 'not_sure':
        return 'Not sure'
    return _label(spec, value)


def _feeds_alert(question: dict) -> bool:
    return any(RULE_LEVELS.get(rule) in ('red', 'amber') for rule in question.get('rules', []))


def _flagged(question: dict, value) -> bool:
    flag = question.get('flag')
    if not flag or is_blank(value):
        return False
    if flag == 'any':
        return True
    values = value if isinstance(value, list) else [value]
    return any(v in flag for v in values)


def history_summary(form: IntakeForm) -> list[dict]:
    """
    The form's answers grouped by section for the doctor's Summary:
    [{module, title, rows: [{question, label, value, highlight, not_answered}]}].

    Rows are the questions the form showed, answered ones plus blank ones that feed a red or amber
    rule (`not_answered`, highlighted). An answer that may set such a rule off (e.g. "yes", or Part A
    "prefer to discuss with the doctor") is highlighted too.
    """
    answers = form.answers or {}
    age = form_age(form)
    modules = modules_for(answers, age, form.extra_modules, form.kind)
    if form.shown_questions:
        shown = set(form.shown_questions)
    elif form.status == IntakeForm.Status.COMPLETE:
        shown = set(answers)  # submitted before the shown questions were recorded
    else:
        shown = visible_questions(answers, age, form.extra_modules, form.kind)
    rows_by_section: dict[str, list] = {}
    for qid, question in QUESTIONS.items():
        if qid not in shown or question['type'] == 'mrs':
            continue
        value = answers.get(qid)
        blank, feeds = is_blank(value), _feeds_alert(question)
        if blank and not feeds:
            continue
        section = placement(question, modules) or SECTION_OF[qid]
        rows_by_section.setdefault(section, []).append({
            'question': qid,
            'label': question['label'],
            'value': '' if blank else format_answer(question, value),
            'highlight': (feeds and blank) or _flagged(question, value),
            'not_answered': blank,
        })
    return [{'module': s['id'], 'title': s['title'], 'rows': rows_by_section[s['id']]}
            for s in SECTIONS if s['id'] in rows_by_section]
