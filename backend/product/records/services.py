import hashlib

from django.conf import settings
from django.db import IntegrityError, transaction

from .models import Document

# Leading bytes of the formats staff may upload; the browser's declared type is not trusted.
_SIGNATURES = (
    (b'%PDF-', 'application/pdf'),
    (b'\xff\xd8\xff', 'image/jpeg'),
    (b'\x89PNG\r\n\x1a\n', 'image/png'),
)


class UploadRejected(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def sniff_content_type(upload) -> str | None:
    upload.seek(0)
    head = upload.read(16)
    upload.seek(0)
    return next((content_type for signature, content_type in _SIGNATURES if head.startswith(signature)), None)


def sha256_of(upload) -> str:
    digest = hashlib.sha256()
    upload.seek(0)
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def store_document(*, organization, patient, upload, uploaded_by, **fields) -> Document:
    if upload.size > settings.DOCUMENT_MAX_UPLOAD_BYTES:
        limit_mb = settings.DOCUMENT_MAX_UPLOAD_BYTES // (1024 * 1024)
        raise UploadRejected('DOCUMENT_TOO_LARGE', f'Files must be {limit_mb} MB or smaller.')
    content_type = sniff_content_type(upload)
    if content_type is None:
        raise UploadRejected('UNSUPPORTED_DOCUMENT_TYPE', 'Upload a PDF, JPG or PNG file.')
    digest = sha256_of(upload)
    existing = Document.objects.filter(patient=patient, sha256=digest).first()
    if existing is not None:
        raise UploadRejected('DUPLICATE_DOCUMENT', f'This file is already in the record as "{existing.title}".')
    document = Document(
        organization=organization,
        patient=patient,
        original_filename=upload.name[:255],
        content_type=content_type,
        size=upload.size,
        sha256=digest,
        uploaded_by=uploaded_by,
        **fields,
    )
    if not document.title:
        document.title = upload.name.rsplit('.', 1)[0][:255] or document.get_slot_display()
    document.file.save(upload.name, upload, save=False)
    try:
        with transaction.atomic():
            document.save()
    except IntegrityError:
        # The same file arrived twice at once; keep the first copy only.
        document.file.delete(save=False)
        raise UploadRejected('DUPLICATE_DOCUMENT', 'This file is already in the record.')
    return document
