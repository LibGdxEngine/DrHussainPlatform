"""
Load the clinic's own wording, prescriptions and leaflets from a JSON file. The format is described
in backend/product/README.md ("Importing clinic content"); an example is in content/import_example/.

    python manage.py import_clinic_content <org-slug> <file.json> [--approve-as <email>]

Content is only ever added as new versions, and only where it changed, so running the same file
twice changes nothing. Nothing is approved unless --approve-as names one of the clinic's doctors.
"""
import json
from collections import Counter
from datetime import date
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMember
from product.patients.models import Language
from product.records.services import UploadRejected, sha256_of

from ...models import (
    EmailTemplate, EmailTemplateVersion, Leaflet, PrescriptionItem, PrescriptionVersion, TemplateKind, TemplatePart,
)
from ...placeholders import allowed_placeholders, validate_text
from ...starter import ensure_starter_content
from ...versioning import add_version

SECTIONS = {'templates', 'prescriptions', 'leaflets'}


class Command(BaseCommand):
    help = "Import the clinic's templates, system phrases, prescriptions and leaflets from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument('organization', help="The clinic's slug.")
        parser.add_argument('path', help='The JSON file.')
        parser.add_argument('--approve-as', dest='approve_as', default=None,
                            help="Approve the imported wording as this doctor (the user's email).")

    def handle(self, *args, organization, path, approve_as=None, **options):
        clinic = Organization.objects.filter(slug=organization).first()
        if clinic is None:
            raise CommandError(f'No clinic with the slug "{organization}".')
        approver = self._approver(clinic, approve_as) if approve_as else None
        source = Path(path)
        try:
            data = json.loads(source.read_text(encoding='utf-8'))
        except (OSError, ValueError) as error:
            raise CommandError(f'Cannot read {source}: {error}') from error
        if not isinstance(data, dict) or set(data) - SECTIONS:
            raise CommandError(f'The file must be an object with only these lists: {", ".join(sorted(SECTIONS))}.')
        for name in SECTIONS:
            if not isinstance(data.get(name, []), list):
                raise CommandError(f'"{name}" must be a list.')

        ensure_starter_content(clinic)
        self.clinic, self.approver, self.counts = clinic, approver, Counter()
        self.note = f'Imported from {source.name} {date.today().isoformat()}'
        self.imported_english = {}
        with transaction.atomic():
            # English first, so a translation in the same file links to the English it translates.
            templates = sorted(enumerate(data.get('templates', [])), key=lambda pair: pair[1].get('language', 'en') != 'en')
            for index, item in templates:
                self._template(item, f'templates[{index}]')
            for index, item in enumerate(data.get('prescriptions', [])):
                self._prescription(item, f'prescriptions[{index}]')
            for index, item in enumerate(data.get('leaflets', [])):
                self._leaflet(item, f'leaflets[{index}]', source.parent)
        summary = ', '.join(f'{name}: {count}' for name, count in sorted(self.counts.items())) or 'nothing to import'
        self.stdout.write(self.style.SUCCESS(f'Imported into {clinic.slug} ({summary}).'))

    def _approver(self, clinic, email):
        user = User.objects.filter(email__iexact=email).first()
        if user is None or not OrganizationMember.objects.filter(
            organization=clinic, user=user, role__in=[OrganizationMember.Role.OWNER, OrganizationMember.Role.ADMIN],
        ).exists():
            raise CommandError(f'{email} is not a doctor (owner or admin) of {clinic.slug}.')
        return user

    # --- Templates and phrases --------------------------------------------------------------------

    def _template(self, item, where):
        if not isinstance(item, dict) or not item.get('key') or not isinstance(item.get('body'), str):
            raise CommandError(f'{where}: each template needs a "key" and a "body".')
        key, language = item['key'], item.get('language', Language.ENGLISH)
        subject, body = item.get('subject', ''), item['body']
        if language not in Language.values:
            raise CommandError(f'{where}: unknown language "{language}".')
        allowed = allowed_placeholders(key)
        problems = validate_text(subject, allowed) + validate_text(body, allowed)
        if problems:
            raise CommandError(f'{where} ({key}): {" ".join(problems)}')

        translated_from = None
        english = None
        if language != Language.ENGLISH:
            english_key = item.get('translated_from_key')
            if not english_key:
                raise CommandError(f'{where} ({key}): a translation must name "translated_from_key".')
            english = EmailTemplate.objects.filter(organization=self.clinic, key=english_key,
                                                   language=Language.ENGLISH).first()
            translated_from = self.imported_english.get(english_key) or (english.approved if english else None)
            if translated_from is None:
                raise CommandError(f'{where} ({key}): "{english_key}" has no English wording to translate from.')

        template = EmailTemplate.objects.filter(organization=self.clinic, key=key, language=language).first()
        if template is None:
            template = self._new_template(item, where, key, language, english)
            self.counts['templates created'] += 1
        elif item.get('name') and item['name'] != template.name:
            template.name = item['name'][:255]
            template.save(update_fields=['name', 'updated_at'])
            self.counts['templates renamed'] += 1

        EmailTemplate.objects.select_for_update().get(pk=template.pk)
        latest = template.versions.order_by('-number').first()
        unchanged = latest is not None and (latest.subject, latest.body, latest.translated_from_id) == (
            subject, body, getattr(translated_from, 'pk', None))
        if unchanged:
            version = latest
        else:
            version = EmailTemplateVersion.objects.create(
                template=template, number=(latest.number + 1) if latest else 1, subject=subject, body=body,
                translated_from=translated_from, note=self.note[:255], created_by=self.approver,
            )
            self.counts['template versions added'] += 1
        if self.approver is not None and version.approved_at is None:
            version.approved_by, version.approved_at = self.approver, timezone.now()
            version.save(update_fields=['approved_by', 'approved_at', 'updated_at'])
            self.counts['template versions approved'] += 1
        if language == Language.ENGLISH:
            self.imported_english[key] = version

    def _new_template(self, item, where, key, language, english):
        if english is not None:
            fields = dict(name=item.get('name') or english.name, kind=english.kind, part=english.part,
                          section_key=english.section_key, sort_order=english.sort_order)
        else:
            kind = TemplateKind.PHRASE if key.startswith('phrase.') else item.get('kind')
            part = item.get('part', TemplatePart.FULL)
            if kind not in TemplateKind.values or part not in TemplatePart.values or not item.get('name'):
                raise CommandError(f'{where} ({key}): a new template needs a "name", a valid "kind" and "part".')
            if part == TemplatePart.SECTION and not item.get('section_key'):
                raise CommandError(f'{where} ({key}): a section needs a "section_key".')
            fields = dict(name=item['name'], kind=kind, part=part, section_key=item.get('section_key', ''),
                          sort_order=item.get('sort_order', 100))
        template = EmailTemplate(organization=self.clinic, key=key, language=language, **fields)
        template.full_clean(exclude=['organization'])
        template.save()
        if english is not None:
            template.default_leaflets.set(english.default_leaflets.all())
        return template

    # --- Prescriptions ----------------------------------------------------------------------------

    def _prescription(self, item, where):
        if not isinstance(item, dict) or not str(item.get('drug', '')).strip():
            raise CommandError(f'{where}: each prescription needs a "drug".')
        wording = {'drug': item['drug'].strip(), 'dose': item.get('dose', ''), 'directions': item.get('directions', '')}
        wanted = wording['drug'].casefold()
        match = next((p for p in PrescriptionItem.objects.filter(organization=self.clinic)
                      if p.current is not None and p.current.drug.strip().casefold() == wanted), None)
        if match is None:
            match = PrescriptionItem.objects.create(organization=self.clinic, sort_order=item.get('sort_order', 100))
            self.counts['prescriptions created'] += 1
        _, created = add_version(match, PrescriptionVersion, wording, user=self.approver, note=self.note)
        if created:
            self.counts['prescription versions added'] += 1

    # --- Leaflets ---------------------------------------------------------------------------------

    def _leaflet(self, item, where, folder: Path):
        from ...views import _store_leaflet_version

        if not isinstance(item, dict) or not item.get('title') or not item.get('pdf_path'):
            raise CommandError(f'{where}: each leaflet needs a "title" and a "pdf_path".')
        folder = folder.resolve()
        pdf = (folder / str(item['pdf_path'])).resolve()
        # Only files inside the import folder: a "../" or absolute path must not read other files.
        try:
            pdf.relative_to(folder)
        except ValueError:
            raise CommandError(f'{where}: "pdf_path" must be a file inside the folder of the import file.')
        if not pdf.is_file():
            raise CommandError(f'{where}: {pdf} does not exist.')
        leaflet = next((x for x in Leaflet.objects.filter(organization=self.clinic)
                        if x.title.strip().casefold() == item['title'].strip().casefold()), None)
        if leaflet is None:
            leaflet = Leaflet.objects.create(organization=self.clinic, title=item['title'].strip()[:255])
            self.counts['leaflets created'] += 1
        with pdf.open('rb') as handle:
            upload = File(handle, name=pdf.name)
            current = leaflet.current
            if current is None or current.sha256 != sha256_of(upload):
                try:
                    _store_leaflet_version(leaflet, upload, self.approver, self.note)
                except UploadRejected as rejected:
                    raise CommandError(f'{where}: {rejected.message}') from rejected
                self.counts['leaflet versions added'] += 1
        for key in item.get('default_for', []):
            templates = EmailTemplate.objects.filter(organization=self.clinic, key=key)
            if not templates.exists():
                raise CommandError(f'{where}: no template "{key}" for default_for.')
            for template in templates:
                if not template.default_leaflets.filter(pk=leaflet.pk).exists():
                    template.default_leaflets.add(leaflet)
                    self.counts['default leaflets linked'] += 1
