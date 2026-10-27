"""Record sent mail, take in received mail, and keep both in the patient's thread."""
import hashlib
from datetime import timezone as dt_timezone
import logging
import re
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.utils import timezone

from product.patients.models import Patient

from .models import MailAttachment, MailMessage, MailThread
from .transport import imap_connection

logger = logging.getLogger(__name__)

MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
# Messages taken in per poll. A first sync of a full inbox then spreads over several beats instead of
# running into the task time limit and losing all its progress.
MAX_MESSAGES_PER_POLL = 50
_FILE_NUMBER = re.compile(r'\bVC-\d{6}\b', re.IGNORECASE)
_MESSAGE_ID = re.compile(r'<[^<>\s]+>')


def _ids(header: str) -> list[str]:
    return _MESSAGE_ID.findall(header or '')


# --- Sent mail ------------------------------------------------------------------------------------

def thread_for_reply(organization, in_reply_to: str):
    if not in_reply_to:
        return None
    message = MailMessage.objects.filter(organization=organization, message_id=in_reply_to).select_related('thread').first()
    return message.thread if message else None


def record_outgoing(organization, *, message_id, subject, body, from_address, to_addresses, patient=None,
                    in_reply_to='', references='', attachment_names=(), sent_email=None, sent_by=None,
                    thread=None) -> MailMessage:
    """Keep a sent email in its thread (the one it replies to, or a new one for the patient)."""
    now = timezone.now()
    thread = thread or thread_for_reply(organization, in_reply_to)
    if thread is None:
        thread = MailThread.objects.create(
            organization=organization, patient=patient, subject=subject[:998],
            contact_email=to_addresses[0] if to_addresses else '', contact_name=patient.full_name if patient else '',
            last_message_at=now,
        )
    message = MailMessage.objects.create(
        organization=organization, thread=thread, direction=MailMessage.Direction.OUTBOUND,
        status=MailMessage.Status.SENT, message_id=message_id, in_reply_to=in_reply_to, references=references,
        from_address=parseaddr(from_address)[1], from_name=parseaddr(from_address)[0], to_addresses=list(to_addresses),
        subject=subject[:998], body_text=body, sent_at=now, attachment_names=list(attachment_names),
        sent_email=sent_email, sent_by=sent_by,
    )
    MailThread.objects.filter(pk=thread.pk).update(has_outbound=True, last_message_at=now)
    return message


def reply_headers(thread: MailThread, to_message: MailMessage | None = None) -> tuple[str, str]:
    """
    In-Reply-To and References for answering `to_message`, or else the latest email received in the
    thread. Date headers come from senders' clocks, so a received email is preferred over ordering.
    """
    target = to_message or (
        thread.messages.filter(direction=MailMessage.Direction.INBOUND).order_by('-sent_at', '-created_at').first()
        or thread.messages.order_by('-created_at').first()
    )
    if target is None:
        return '', ''
    references = ' '.join(dict.fromkeys([*_ids(target.references), target.message_id]))
    return target.message_id, references


# --- Received mail --------------------------------------------------------------------------------

def visible_text(body: str) -> str:
    """The patient's own words: quoted earlier messages and the "On ... wrote:" line removed."""
    lines = []
    for line in body.splitlines():
        if re.match(r'^\s*On .+ wrote:\s*$', line) or line.strip().startswith('-----Original Message'):
            break
        if line.lstrip().startswith('>'):
            continue
        lines.append(line)
    return '\n'.join(lines).strip()


def _body_text(message) -> str:
    part = message.get_body(preferencelist=('plain', 'html'))
    if part is None:
        return ''
    content = part.get_content()
    if part.get_content_type() == 'text/html':
        content = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', content, flags=re.S | re.I)
        content = re.sub(r'<br\s*/?>|</p>', '\n', content, flags=re.I)
        content = re.sub(r'<[^>]+>', '', content)
    return content.strip()


def _match_patient(organization, sender: str):
    matches = list(Patient.objects.filter(organization=organization, email__iexact=sender)[:2]) if sender else []
    return matches[0] if len(matches) == 1 else None


def _suggest_patient(organization, text: str):
    found = _FILE_NUMBER.search(text or '')
    if not found:
        return None
    return Patient.objects.filter(organization=organization, file_number=found.group(0).upper()).first()


@transaction.atomic
def ingest(organization, raw: bytes, *, imap_uid=None) -> MailMessage | None:
    """
    Take in one received email. It joins the thread it replies to; otherwise its sender's address
    is matched to a patient file, and failing that it waits in "Not matched" for staff to link.
    """
    parsed = BytesParser(policy=policy.default).parsebytes(raw)
    message_id = (_ids(str(parsed.get('Message-ID', ''))) or [None])[0] or (
        '<sha256-' + hashlib.sha256(raw).hexdigest() + '@received>'
    )
    if MailMessage.objects.filter(organization=organization, message_id=message_id).exists():
        return None  # already taken in (a re-read of the mailbox)
    from_name, from_address = parseaddr(str(parsed.get('From', '')))
    in_reply_to = (_ids(str(parsed.get('In-Reply-To', ''))) or [''])[0]
    references = ' '.join(_ids(str(parsed.get('References', ''))))
    subject = str(parsed.get('Subject', ''))[:998]
    body = _body_text(parsed)
    try:
        sent_at = parsedate_to_datetime(str(parsed.get('Date'))) if parsed.get('Date') else timezone.now()
    except (TypeError, ValueError):
        sent_at = timezone.now()
    if timezone.is_naive(sent_at):
        sent_at = timezone.make_aware(sent_at, dt_timezone.utc)

    thread = thread_for_reply(organization, in_reply_to)
    if thread is None:
        for earlier in reversed(_ids(references)):
            thread = thread_for_reply(organization, earlier)
            if thread:
                break
    if thread is None:
        patient = _match_patient(organization, from_address)
        thread = MailThread.objects.create(
            organization=organization, patient=patient,
            suggested_patient=None if patient else _suggest_patient(organization, f'{subject}\n{body}'),
            subject=subject, contact_email=from_address, contact_name=from_name, last_message_at=sent_at,
        )
    try:
        with transaction.atomic():
            message = MailMessage.objects.create(
                organization=organization, thread=thread, direction=MailMessage.Direction.INBOUND,
                status=MailMessage.Status.RECEIVED, message_id=message_id, in_reply_to=in_reply_to,
                references=references, from_address=from_address, from_name=from_name,
                to_addresses=[a for _, a in getaddresses(parsed.get_all('To', []))], subject=subject,
                body_text=body, sent_at=sent_at, imap_uid=imap_uid,
            )
    except IntegrityError:
        return None
    for part in parsed.iter_attachments():
        content = part.get_payload(decode=True) or b''
        if not content or len(content) > MAX_ATTACHMENT_BYTES:
            continue
        attachment = MailAttachment(
            message=message, filename=(part.get_filename() or 'attachment')[:255],
            content_type=part.get_content_type()[:100], size=len(content),
        )
        attachment.file.save(attachment.filename, ContentFile(content), save=False)
        attachment.save()
    MailThread.objects.filter(pk=thread.pk).update(
        has_inbound=True, unread=True, archived=False, last_message_at=max(thread.last_message_at, sent_at),
    )
    transaction.on_commit(lambda: _after_ingest(message.pk))
    return message


def _after_ingest(message_pk):
    """A patient's question about a prescription becomes a reply case in the review queue."""
    from product.review.services import open_reply_case

    message = MailMessage.objects.select_related('thread__patient').get(pk=message_pk)
    if message.thread.patient_id and is_prescription_question(message):
        open_reply_case(message)


PRESCRIPTION_WORDS = (
    'prescription', 'prescribed', 'medicine', 'medication', 'tablet', 'pill', 'capsule', 'cream', 'dose',
    'dosage', 'side effect', 'side-effect', 'pharmacy', 'refill', 'drug',
    'دواء', 'الدواء', 'علاج', 'روشتة', 'الروشتة', 'وصفة', 'جرعة', 'حبوب', 'كريم',
)


def is_prescription_question(message: MailMessage) -> bool:
    """
    True when the patient is asking about medicine: they use a medicine word, or they reply to a
    results email that prescribed something and either ask a question or name the prescribed drug.
    """
    own_words = visible_text(message.body_text)
    text = f'{message.subject}\n{own_words}'.casefold()
    if any(word in text for word in PRESCRIPTION_WORDS):
        return True
    from product.content.models import PrescriptionVersion

    prescribed = PrescriptionVersion.objects.filter(
        drafts__sent_emails__mail_message__thread=message.thread,
    ).values_list('drug', flat=True).distinct()
    drugs = [drug for drug in prescribed if drug]
    if not drugs:
        return False
    named = any(word in text for drug in drugs for word in re.findall(r'[^\W\d_]{4,}', drug.casefold()))
    return named or '?' in own_words


def quote_folder(name: str) -> str:
    """An IMAP quoted string: the folder name with backslashes and quotes escaped, in double quotes."""
    if any(ch in name for ch in '\r\n\0'):
        raise ValueError('Folder names cannot contain line breaks.')
    return '"' + name.replace('\\', '\\\\').replace('"', '\\"') + '"'


def poll(mailbox) -> int:
    """
    Take in new mail since the last poll. Returns how many messages were added.

    The cursor (`last_uid`) is saved after every message, so a time limit or an error part-way
    through keeps what was done. A message that cannot be read is skipped and noted in `last_error`
    rather than blocking everything behind it; at most MAX_MESSAGES_PER_POLL are read per call, the
    rest wait for the next beat.
    """
    client = imap_connection(mailbox)
    added = 0
    skipped = []
    try:
        status, data = client.select(quote_folder(mailbox.imap_folder), readonly=True)
        if status != 'OK':
            raise RuntimeError(f'Cannot open folder {mailbox.imap_folder}')
        validity = _uid_validity(client)
        if validity is not None and mailbox.uid_validity not in (None, validity):
            # The server renumbered the folder; start again (duplicates are skipped by Message-ID).
            mailbox.last_uid = 0
        mailbox.uid_validity = validity
        status, data = client.uid('SEARCH', None, f'UID {mailbox.last_uid + 1}:*')
        uids = sorted(int(u) for u in (data[0] or b'').split() if int(u) > mailbox.last_uid)
        for uid in uids[:MAX_MESSAGES_PER_POLL]:
            status, fetched = client.uid('FETCH', str(uid), '(RFC822)')
            raw = next((part[1] for part in fetched or [] if isinstance(part, tuple)), None)
            try:
                if raw and ingest(mailbox.organization, raw, imap_uid=uid):
                    added += 1
            except Exception:  # noqa: BLE001 - one unreadable message must not block the mailbox
                logger.exception('Mailbox %s: message UID %s could not be taken in', mailbox.pk, uid)
                skipped.append(uid)
            mailbox.last_uid = uid
            mailbox.save(update_fields=['last_uid', 'uid_validity', 'updated_at'])
    finally:
        try:
            client.logout()
        except Exception:  # noqa: BLE001 - the session is closing anyway
            pass
    mailbox.last_synced_at = timezone.now()
    mailbox.last_error = (
        f'{len(skipped)} message(s) could not be read and were skipped (IMAP UID {", ".join(map(str, skipped))})'[:255]
        if skipped else ''
    )
    mailbox.save(update_fields=['last_uid', 'uid_validity', 'last_synced_at', 'last_error', 'updated_at'])
    return added


def _uid_validity(client):
    status, data = client.response('UIDVALIDITY')
    try:
        return int(data[0]) if data and data[0] else None
    except (TypeError, ValueError):
        return None
