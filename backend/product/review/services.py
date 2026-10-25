"""Route read reports, build drafts from approved templates, and gate sending on the doctor."""
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction

from product.content.models import ClinicProfile, EmailTemplate
from product.content.placeholders import render
from product.patients.models import Language
from product.results.comparison import Change, compare
from product.results.extraction.classify import INFECTION_TESTS
from product.results.models import InvestigationReport, ReportType

from .models import Draft, ResultsCase, ReviewAction

SMEAR_PLAN_KEYS = [f'smear_section_{n}' for n in range(2, 15)]
_STI_ORDER = sorted(INFECTION_TESTS)


class ReviewError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _day(value: date | None) -> str:
    return f'{value.day} {value:%b %Y}' if value else ''


# --- Routing --------------------------------------------------------------------------------------

@dataclass
class Decision:
    status: str
    route: str = ''
    keys: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    # Per section key: the result it is about, for {{result.name}} and {{result.value}}.
    sections: dict[str, tuple[str, str]] = field(default_factory=dict)


def _doctor_flags(report: InvestigationReport) -> list[str]:
    """Flags still open: patient doubts are settled once the doctor confirms the report."""
    if report.status == InvestigationReport.Status.CONFIRMED:
        return [r for r in report.flag_reasons if not r.startswith('patient_')]
    return list(report.flag_reasons)


def decide(report: InvestigationReport, case: ResultsCase | None = None, *, ignore_flags: bool = False) -> Decision:
    """The spec's routing table. Anything unclear goes to the doctor with no draft."""
    flags = [] if ignore_flags else _doctor_flags(report)
    if flags:
        return Decision(ResultsCase.Status.FLAGGED, flags=flags)
    values = list(report.values.select_related('lab_test'))
    kind = report.report_type
    if kind == ReportType.UNKNOWN:
        return Decision(ResultsCase.Status.FLAGGED, flags=['unknown_report_type'])
    if kind == ReportType.SMEAR_ABNORMAL:
        # No draft until the doctor has chosen the plan; then the matching section is used.
        if case is None or case.plan_template is None:
            return Decision(ResultsCase.Status.AWAITING_PLAN, route='smear')
        return Decision(ResultsCase.Status.DRAFTED, route='smear', keys=[case.plan_template.key])
    if kind == ReportType.SMEAR_NORMAL:
        return Decision(ResultsCase.Status.DRAFTED, route='smear', keys=['smear_section_1'])
    if kind == ReportType.INFECTION:
        positive = {
            v.lab_test.code: v for v in values
            if v.lab_test and v.lab_test.code in INFECTION_TESTS and v.flag == 'A'
        }
        if positive:
            keys = [f'sti_section_{code}' for code in _STI_ORDER if code in positive]
            sections = {f'sti_section_{c}': (v.lab_test.name, v.value_text) for c, v in positive.items()}
            return Decision(ResultsCase.Status.DRAFTED, route='infection',
                            keys=['sti_opening', *keys, 'sti_closing'], sections=sections)
        return Decision(ResultsCase.Status.DRAFTED, route='results', keys=['results'])
    if kind == ReportType.PATHOLOGY:
        return Decision(ResultsCase.Status.DRAFTED, route='pathology', keys=['pathology_results'])
    # Blood tests: earlier results for the same tests make it a follow-up comparison.
    if any(v.lab_test_id and compare(v).change != Change.FIRST for v in values):
        return Decision(ResultsCase.Status.DRAFTED, route='follow_up', keys=['follow_up_comparison'])
    if kind == ReportType.MENOPAUSE_BLOODS:
        return Decision(ResultsCase.Status.DRAFTED, route='menopause', keys=['menopause_results'])
    return Decision(ResultsCase.Status.DRAFTED, route='results', keys=['results'])


def _log(case, action, actor=None, **details):
    return ReviewAction.objects.create(case=case, action=action, actor=actor, details=details)


@transaction.atomic
def route_report(report: InvestigationReport, *, actor=None) -> ResultsCase | None:
    """Open or refresh the report's case. Sent and rejected cases are never reopened."""
    if report.method == InvestigationReport.Method.MANUAL or report.status == InvestigationReport.Status.PENDING:
        return None
    case, created = ResultsCase.objects.select_for_update().get_or_create(
        report=report,
        defaults={'organization': report.organization, 'patient': report.patient,
                  'status': ResultsCase.Status.FLAGGED},
    )
    if not created and case.status in {ResultsCase.Status.SENDING, ResultsCase.Status.SENT,
                                       ResultsCase.Status.REJECTED}:
        return case
    _log(case, ReviewAction.Action.OPENED if created else ReviewAction.Action.REROUTED, actor)
    # A new reading may bring new flags, so an earlier "draft anyway" no longer applies.
    case.flags_overridden = False
    _apply(case, decide(report, case), actor=actor)
    return case


def _apply(case, decision: Decision, *, actor=None, **draft_options):
    case.drafts.filter(is_current=True).update(is_current=False)
    case.route = decision.route
    case.flag_reasons = decision.flags
    case.status = decision.status
    if decision.status == ResultsCase.Status.DRAFTED:
        try:
            draft = build_draft(case, decision, user=actor, **draft_options)
        except ReviewError as missing:
            case.status = ResultsCase.Status.FLAGGED
            case.flag_reasons = [missing.code]
            _log(case, ReviewAction.Action.FLAGGED, actor, reasons=case.flag_reasons, detail=missing.message)
        else:
            _log(case, ReviewAction.Action.DRAFTED, actor, draft=str(draft.pk), route=case.route,
                 templates=decision.keys)
    elif decision.status == ResultsCase.Status.FLAGGED:
        _log(case, ReviewAction.Action.FLAGGED, actor, reasons=decision.flags)
    case.save()


# --- Drafting -------------------------------------------------------------------------------------

def _number(value) -> str:
    """13.0000 → 13, 0.4000 → 0.4."""
    return format(value.normalize(), 'f')


def _value_line(v) -> str:
    name = v.lab_test.name if v.lab_test else v.raw_name
    if v.unreadable:
        return f'{name}: could not be read'
    value = f'{v.value_text} {v.unit}'.strip()
    reference = v.ref_text or (
        f'{_number(v.ref_low)}–{_number(v.ref_high)}' if v.ref_low is not None and v.ref_high is not None else ''
    )
    flag = {'H': ' (high)', 'L': ' (low)', 'A': ' (abnormal)'}.get(v.flag, '')
    return f'{name}: {value}{flag}' + (f' (reference {reference})' if reference else '')


_CHANGE_WORDS = {Change.UP: 'higher', Change.DOWN: 'lower', Change.SAME: 'unchanged', Change.CHANGED: 'changed'}


def _comparison_line(v) -> str | None:
    result = compare(v)
    if result.previous is None:
        return None
    name = v.lab_test.name if v.lab_test else v.raw_name
    before = f'{result.previous.value_text} {result.previous.unit}'.strip()
    now = f'{v.value_text} {v.unit}'.strip()
    when_before, when_now = _day(result.previous.result_date), _day(v.result_date)
    if result.change == Change.NOT_COMPARABLE:
        # Shown side by side, never as a stated change.
        return f'{name}: {before} on {when_before} and {now} on {when_now} (measured differently, not compared)'
    return f'{name}: {before} on {when_before} → {now} on {when_now} ({_CHANGE_WORDS[result.change]})'


def draft_values(case: ResultsCase, *, prescriptions=(), follow_up: str = '') -> dict[str, str]:
    report, patient = case.report, case.patient
    values = list(report.values.select_related('lab_test').order_by('position'))
    profile = ClinicProfile.objects.filter(organization=case.organization).first()
    abnormal = [v for v in values if v.is_abnormal]
    comparisons = [line for line in (_comparison_line(v) for v in values if v.lab_test_id) if line]
    return {
        'patient.first_name': patient.full_name.split()[0] if patient.full_name else '',
        'patient.full_name': patient.full_name,
        'patient.file_number': patient.file_number,
        'report.date': _day(report.collected_on),
        'report.lab': report.lab_name,
        'results.table': '\n'.join(_value_line(v) for v in values),
        'results.abnormal': '\n'.join(_value_line(v) for v in abnormal) or 'All results are within the reference range.',
        'comparison.table': '\n'.join(comparisons),
        'clinic.name': (profile and profile.display_name) or case.organization.name,
        'clinic.phone': profile.phone if profile else '',
        'doctor.name': profile.doctor_name if profile else '',
        'today': _day(date.today()),
        'prescription': '\n'.join(
            ' '.join(p for p in [v.drug, v.dose] if p) + (f'. {v.directions}' if v.directions else '')
            for v in prescriptions
        ),
        'follow_up': follow_up.strip(),
    }


def _approved_versions(case, keys, language):
    """The approved wording for each part, in `language`; English stands in when a translation is missing."""
    templates = {
        (t.key, t.language): t
        for t in EmailTemplate.objects.filter(organization=case.organization, key__in=keys, archived=False)
        .prefetch_related('default_leaflets')
    }
    chosen, translated = [], True
    missing = []
    for key in keys:
        template = templates.get((key, language))
        version = template.approved if template else None
        if version is None and language != Language.ENGLISH:
            template = templates.get((key, Language.ENGLISH))
            version = template.approved if template else None
            translated = False
        if version is None:
            missing.append(key)
        else:
            chosen.append((key, template, version))
    if missing:
        raise ReviewError('template_not_approved',
                          f'These templates have no approved wording yet: {", ".join(missing)}.')
    return chosen, translated


@transaction.atomic
def build_draft(case, decision: Decision, *, user=None, language=Language.ENGLISH, prescriptions=(),
                follow_up='', leaflets=None, attach_report=None) -> Draft:
    parts, translated = _approved_versions(case, decision.keys, language)
    values = draft_values(case, prescriptions=prescriptions, follow_up=follow_up)
    subject, bodies, open_slots = '', [], []
    for key, template, version in parts:
        section_values = dict(values)
        if key in decision.sections:
            section_values['result.name'], section_values['result.value'] = decision.sections[key]
        if not subject and version.subject:
            rendered_subject = render(version.subject, section_values)
            subject, open_slots = rendered_subject.text, [*open_slots, *rendered_subject.open_slots]
        rendered = render(version.body, section_values)
        bodies.append(rendered.text.strip())
        open_slots.extend(rendered.open_slots)
    body = '\n\n'.join(b for b in bodies if b)
    if language != Language.ENGLISH and not translated:
        # No approved translation: the doctor translates and approves it like any other draft.
        body = f'[[Translate into Arabic]]\n\n{body}'
        open_slots.insert(0, 'Translate into Arabic')
    profile = ClinicProfile.objects.filter(organization=case.organization).first()
    if profile and profile.signature.strip():
        body = f'{body}\n\n{profile.signature.strip()}'

    case.drafts.filter(is_current=True).update(is_current=False)
    draft = Draft.objects.create(
        case=case, language=language, subject=subject or 'Your results', body=body,
        open_slots=list(dict.fromkeys(open_slots)), follow_up=follow_up,
        attach_report=bool(attach_report), created_by=user,
    )
    draft.template_versions.set([version for _, _, version in parts])
    draft.prescriptions.set(prescriptions)
    if leaflets is None:
        defaults = {leaflet for _, template, _ in parts for leaflet in template.default_leaflets.filter(archived=False)}
        leaflets = [leaflet.current for leaflet in defaults if leaflet.current]
    draft.leaflets.set(leaflets)
    return draft


def rebuild(case, *, user, language=None, prescriptions=None, follow_up=None, leaflets=None, attach_report=None,
            ignore_flags=False):
    """Build a fresh draft, keeping the current draft's choices unless new ones are given."""
    current = case.current_draft
    if ignore_flags:
        case.flags_overridden = True
    decision = decide(case.report, case, ignore_flags=case.flags_overridden)
    if decision.status != ResultsCase.Status.DRAFTED:
        raise ReviewError('cannot_draft', 'This case cannot be drafted yet.', status=409)
    options = {
        'language': language or (current.language if current else Language.ENGLISH),
        'prescriptions': prescriptions if prescriptions is not None else (list(current.prescriptions.all()) if current else []),
        'follow_up': follow_up if follow_up is not None else (current.follow_up if current else ''),
        'leaflets': leaflets if leaflets is not None else (list(current.leaflets.all()) if current else None),
        'attach_report': attach_report if attach_report is not None else (current.attach_report if current else False),
    }
    _apply(case, decision, actor=user, **options)
    if case.status != ResultsCase.Status.DRAFTED:
        raise ReviewError(case.flag_reasons[0] if case.flag_reasons else 'cannot_draft',
                          'The draft could not be built; see the case flags.', status=409)
    return case.current_draft


def edit_draft(case, *, user, subject=None, body=None, leaflets=None, attach_report=None) -> Draft:
    draft = case.current_draft
    if case.status != ResultsCase.Status.DRAFTED or draft is None:
        raise ReviewError('not_editable', 'Only a draft waiting for review can be edited.', status=409)
    values = draft_values(case, prescriptions=list(draft.prescriptions.all()), follow_up=draft.follow_up)
    changed = []
    if subject is not None and subject != draft.subject:
        draft.subject = render(subject, values).text
        changed.append('subject')
    if body is not None and body != draft.body:
        draft.body = render(body, values).text
        changed.append('body')
    if attach_report is not None and attach_report != draft.attach_report:
        draft.attach_report = attach_report
        changed.append('attach_report')
    if leaflets is not None:
        draft.leaflets.set(leaflets)
        changed.append('leaflets')
    draft.open_slots = list(dict.fromkeys(render(draft.subject, {}).open_slots + render(draft.body, {}).open_slots))
    draft.edited = draft.edited or bool({'subject', 'body'} & set(changed))
    draft.save()
    _log(case, ReviewAction.Action.EDITED, user, fields=changed)
    return draft


def choose_plan(case, template: EmailTemplate, *, user) -> ResultsCase:
    if case.report.report_type != ReportType.SMEAR_ABNORMAL:
        raise ReviewError('not_a_smear', 'Only an abnormal smear needs a plan.', status=409)
    if case.status not in {ResultsCase.Status.AWAITING_PLAN, ResultsCase.Status.DRAFTED, ResultsCase.Status.FLAGGED}:
        raise ReviewError('not_editable', 'This case is closed.', status=409)
    if template.key not in SMEAR_PLAN_KEYS:
        raise ReviewError('invalid_plan', 'Choose one of the cervical smear sections 2 to 14.')
    case.plan_template = template
    case.save(update_fields=['plan_template', 'updated_at'])
    _log(case, ReviewAction.Action.PLAN_CHOSEN, user, template=template.key)
    _apply(case, decide(case.report, case), actor=user)
    return case


def reject(case, *, user, reason: str) -> ResultsCase:
    if case.status in {ResultsCase.Status.SENDING, ResultsCase.Status.SENT}:
        raise ReviewError('already_sent', 'This email has already been sent.', status=409)
    case.status = ResultsCase.Status.REJECTED
    case.save(update_fields=['status', 'updated_at'])
    case.drafts.filter(is_current=True).update(is_current=False)
    _log(case, ReviewAction.Action.REJECTED, user, reason=reason)
    return case


@transaction.atomic
def approve_and_send(case, *, user):
    """
    The only way a results email leaves the clinic: the doctor approves the current draft. There
    is deliberately no setting, task or rule that sends without this call.
    """
    from .models import SentEmail
    from .tasks import send_case_email

    case = ResultsCase.objects.select_for_update().get(pk=case.pk)
    draft = case.current_draft
    if case.status != ResultsCase.Status.DRAFTED or draft is None:
        raise ReviewError('not_ready', 'There is no draft waiting for approval.', status=409)
    if draft.open_slots:
        raise ReviewError('open_slots', 'Fill in every highlighted blank first: ' + ', '.join(draft.open_slots) + '.')
    if not case.patient.email:
        raise ReviewError('no_patient_email', "The patient's file has no email address.")
    sent = SentEmail.objects.create(
        case=case, draft=draft, to_address=case.patient.email, from_address='', subject=draft.subject,
        body=draft.body, approved_by=user,
        attachments=[{'kind': 'leaflet', 'id': str(v.pk), 'name': v.original_filename} for v in draft.leaflets.all()]
        + ([{'kind': 'report', 'id': str(case.report.document_id), 'name': case.report.document.original_filename}]
           if draft.attach_report else []),
    )
    case.status = ResultsCase.Status.SENDING
    case.save(update_fields=['status', 'updated_at'])
    _log(case, ReviewAction.Action.APPROVED, user, sent_email=str(sent.pk), draft=str(draft.pk))
    transaction.on_commit(lambda: send_case_email.delay(str(sent.pk)))
    return sent
