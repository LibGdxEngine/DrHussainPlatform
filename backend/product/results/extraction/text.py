"""Turn an uploaded report into plain text on this server. Nothing is sent to an outside service."""
import re
import warnings
from dataclasses import dataclass

from django.conf import settings

# Invisible direction marks OCR inserts around mixed-script text.
_BIDI_MARKS = re.compile(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069]')

# Below this many characters a PDF page is treated as a scan and read with OCR.
MIN_TEXT_CHARS_PER_PAGE = 40


class ExtractionError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class ExtractedText:
    text: str
    method: str  # 'text' or 'ocr'


def _ocr(image) -> str:
    import pytesseract

    try:
        return _BIDI_MARKS.sub('', pytesseract.image_to_string(image, lang=settings.RESULTS_OCR_LANGUAGES))
    except pytesseract.TesseractNotFoundError as exc:
        raise ExtractionError('ocr_unavailable') from exc


def extract_text(file, content_type: str) -> ExtractedText:
    """Read text from a PDF (its text layer, else OCR of each page) or a scanned image."""
    from PIL import Image

    # A decompression-bomb guard: a small file can claim a huge canvas. PIL warns at the limit and
    # only raises at twice it, so the warning is made an error and both become one refusal.
    Image.MAX_IMAGE_PIXELS = settings.RESULTS_MAX_IMAGE_PIXELS
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        try:
            return _extract(file, content_type)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ExtractionError('image_too_large') from exc


def _extract(file, content_type: str) -> ExtractedText:
    max_pages = settings.RESULTS_MAX_PAGES
    if content_type in {'image/jpeg', 'image/png'}:
        from PIL import Image, UnidentifiedImageError

        try:
            with Image.open(file) as image:
                return ExtractedText(_ocr(image), 'ocr')
        except UnidentifiedImageError as exc:
            raise ExtractionError('unreadable_document') from exc

    import pdfplumber
    from pdfminer.pdfparser import PDFSyntaxError

    try:
        with pdfplumber.open(file) as pdf:
            pages = pdf.pages[:max_pages]
            if len(pdf.pages) > max_pages:
                raise ExtractionError('too_many_pages')
            texts, used_ocr = [], False
            for page in pages:
                text = page.extract_text(x_tolerance=1.5, layout=True) or ''
                if len(text.strip()) < MIN_TEXT_CHARS_PER_PAGE:
                    text = _ocr(page.to_image(resolution=settings.RESULTS_OCR_DPI).original)
                    used_ocr = True
                texts.append(text)
    except ExtractionError:
        raise
    except (PDFSyntaxError, ValueError, KeyError, TypeError) as exc:
        raise ExtractionError('unreadable_document') from exc
    except Exception as exc:
        # pdfplumber/pypdfium2 raise their own error types for damaged or encrypted files.
        if exc.__class__.__module__.split('.')[0] in {'pdfminer', 'pdfplumber', 'pypdfium2'}:
            raise ExtractionError('unreadable_document') from exc
        raise
    text = '\n'.join(texts)
    if not text.strip():
        raise ExtractionError('no_text_found')
    return ExtractedText(text, 'ocr' if used_ocr else 'text')
