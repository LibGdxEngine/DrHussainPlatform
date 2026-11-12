"""Route read reports, build drafts from approved templates, and gate sending on the doctor."""
import logging
import re
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction
from django.utils import formats, timezone, translation

from product.content.models import AlertRule, ClinicProfile, EmailTemplate, EmailTemplateVersion, TemplateKind
from product.content.placeholders import allowed_placeholders, placeholder_names, render, validate_text
from product.content.starter import STARTER_PHRASES
from product.patients.models import Language
from product.results.comparison import Change, compare_many
from product.results.extraction.classify import INFECTION_TESTS
from product.results.models import InvestigationReport, ReportType

from .models import CaseTranslation, Draft, DraftSectionPrescription, ResultsCase, ReviewAction

logger = logging.getLogger(__name__)

SMEAR_PLAN_KEYS = [f'smear_section_{n}' for n in range(2, 15)]
_STI_ORDER = sorted(INFECTION_TESTS)
STI_SECTION = 'sti_section_'
SIGNATURE = 'phrase.signature'
TRANSLATE_SLOT = 'Translate: '
# The answer check of the rule (R11) about a peanut allergy and progesterone in peanut oil.
PEANUT_CHECK = 'peanut_allergy_progesterone'


OPEN_STATUSES = (ResultsCase.Status.FLAGGED, ResultsCase.Status.AWAITING_PLAN, ResultsCase.Status.DRAFTED)
# Flags "draft anyway" never overrides: only the doctor's check of each value clears them.
VALUE_FLAGS = ('uncertain_value', 'unreadable_value')
_MARKER_PAIR = re.compile(r'([{}\[\]])(?=\1)')


class ReviewError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, context: dict | None = None):
        super().__init__(message)
        self.code, self.message, self.status, self.context = code, message, status, context


def _inert(text) -> str:
    """
    Text from people (a sender's words, a name, a lab's printout, the follow-up typed in review) with
    every {{, }}, [[ and ]] split, so no later render reads it as a placeholder or a blank.
    """
    return _MARKER_PAIR.sub(r'\1 ', str(text or ''))


def _day(value: date | None, language: str = Language.ENGLISH) -> str:
    """A date in the draft's language, from Django's own locale data (no wording of ours)."""
    if not value:
        return ''
    with translation.override(language):
        return formats.date_format(value, 'j F Y')


# --- Routing --------------------------------------------------------------------------------------

@dataclass
class Decision:
    status: str
    route: str = ''
    keys: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    # Per section key: the result it is about, for {{result.name}} and {{result.value}}.
    sections: dict[str, tuple[str, str]] = field(default_factory=dict)


def _value_flags(report: InvestigationReport | None) -> list[str]:
    """Values the doctor has not checked yet: one still marked uncertain, or an unreadable one never looked at."""
    if report is None:
        return []
    flags = []
    if report.values.filter(needs_check=True).exists():
        flags.append('uncertain_value')
    if report.values.filter(unreadable=True, checked_at__isnull=True).exists():
        flags.append('unreadable_value')
    return flags


def _doctor_flags(report: InvestigationReport) -> list[str]:
    """Flags still open: patient doubts are settled once the doctor confirms the report."""
    flags = list(report.flag_reasons)
    if report.status == InvestigationReport.Status.CONFIRMED:
        flags = [r for r in flags if not r.startswith('patient_')]
    # Every uncertain or unreadable value has been confirmed or corrected; any still unchecked flags it.
    unchecked = _value_flags(report)
    flags = [f for f in flags if f not in VALUE_FLAGS or f in unchecked]
    return list(dict.fromkeys([*flags, *unchecked]))


def _override_at(case: ResultsCase | None):
    """When the doctor last chose "draft anyway" on this case, or None."""
    if case is None or case.pk is None:
        return None
    action = case.actions.filter(action=ReviewAction.Action.DRAFTED_ANYWAY).order_by('-created_at').first()
    return action.created_at if action else None


def _red_alerts(report: InvestigationReport | None, patient, *, since=None):
    """Open red alerts that hold this case: fired by this report, or by the patient's form answers."""
    from django.db.models import Q

    from product.alerts.models import PatientAlert

    held = Q(patient=patient, intake_form__isnull=False)
    if report is not None:
        held |= Q(report=report)
    alerts = PatientAlert.objects.filter(held, status=PatientAlert.Status.OPEN, level='red').select_related('rule')
    if since is not None:
        alerts = alerts.filter(created_at__gte=since)
    return list(alerts)


def _rules_not_checked(patient, *, since=None) -> bool:
    from product.intake.history import latest_complete_form

    latest = latest_complete_form(patient)
    # Forms submitted before the catalogue (no catalogue_version) are never re-checked, so are exempt.
    if latest is None or not latest.catalogue_version:
        return False
    if latest.rules_evaluated_at is not None and not latest.rule_errors:
        return False
    return since is None or latest.updated_at >= since


def _alert_flags(report: InvestigationReport | None, patient, *, since=None, rule_errors=()) -> list[str]:
    """
    What about the patient the doctor must see before a draft is made or sent: red alerts fired by
    this report (by rule code), red answer alerts, and alert rules that could not be checked. With
    `since` (the doctor's "draft anyway"), only what appeared after it.
    """
    alerts = _red_alerts(report, patient, since=since)
    flags = [f'red_alert_{a.rule.code}' for a in alerts if report is not None and a.report_id == report.pk]
    if any(a.intake_form_id for a in alerts if not (report is not None and a.report_id == report.pk)):
        flags.append('red_alert_open')
    if rule_errors or _rules_not_checked(patient, since=since):
        flags.append('alert_rules_not_checked')
    return flags


def decide(report: InvestigationReport | None, case: ResultsCase | None = None, *, ignore_flags: bool = False,
           rule_errors=()) -> Decision:
    """
    The spec's routing table. Anything unclear goes to the doctor with no draft. After "draft anyway"
    (`ignore_flags`) only unchecked values, and alerts that opened after the doctor's choice, still hold it.
    """
    if case is not None and case.kind == ResultsCase.Kind.REPLY:
        # A red answer alert stops a reply being sent, so the doctor sees it here first.
        since = (_override_at(case) or timezone.now()) if ignore_flags else None
        if _red_alerts(None, case.patient, since=since):
            return Decision(ResultsCase.Status.FLAGGED, flags=['red_alert_open'])
        return Decision(ResultsCase.Status.DRAFTED, route='reply', keys=['prescription_reply'])
    if ignore_flags:
        # Called without a recorded "draft anyway" (e.g. by the demo seed): the override is now.
        since = _override_at(case) or timezone.now()
        flags = _value_flags(report) + _alert_flags(report, report.patient, since=since)
    else:
        flags = _doctor_flags(report) + _alert_flags(report, report.patient, rule_errors=rule_errors)
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
            keys = [f'{STI_SECTION}{code}' for code in _STI_ORDER if code in positive]
            sections = {f'{STI_SECTION}{c}': (v.lab_test.name, v.value_text) for c, v in positive.items()}
            return Decision(ResultsCase.Status.DRAFTED, route='infection',
                            keys=['sti_opening', *keys, 'sti_closing'], sections=sections)
        return Decision(ResultsCase.Status.DRAFTED, route='results', keys=['results'])
    if kind == ReportType.PATHOLOGY:
        return Decision(ResultsCase.Status.DRAFTED, route='pathology', keys=['pathology_results'])
    # Blood tests: earlier results for the same tests make it a follow-up comparison.
    comparisons = compare_many([v for v in values if v.lab_test_id])
    if any(result.change != Change.FIRST for result in comparisons.values()):
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
        report=report, kind=ResultsCase.Kind.REPORT,
        defaults={'organization': report.organization, 'patient': report.patient,
                  'status': ResultsCase.Status.FLAGGED},
    )
    if not created and case.status not in OPEN_STATUSES:
        return case
    _log(case, ReviewAction.Action.OPENED if created else ReviewAction.Action.REROUTED, actor)
    rule_errors = _check_rules(report.patient, exclude_case=case.pk)
    # A new reading may bring new flags, so an earlier "draft anyway" no longer applies.
    case.flags_overridden = False
    _apply(case, decide(report, case, rule_errors=rule_errors), actor=actor)
    return case


def _check_rules(patient, *, exclude_case=None) -> list:
    """
    Run the patient's alert rules (the patient's other open cases are routed again); the errors of
    any rule that could not be checked.
    """
    from product.alerts.services import evaluate_patient_safely

    return list(evaluate_patient_safely(patient, exclude_case=exclude_case) or [])


def _holds_only(flags) -> bool:
    """Flags that stop a draft being sent but do not change it: unchecked values, alerts, unchecked rules."""
    return bool(flags) and all(f in VALUE_FLAGS or f.startswith('red_alert_') or f == 'alert_rules_not_checked'
                               for f in flags)


def _hold(case, flags, actor=None) -> None:
    """Back to the doctor for these flags, keeping the current draft (and its edits) for when they clear."""
    case.status, case.flag_reasons = ResultsCase.Status.FLAGGED, list(flags)
    current = case.current_draft
    _log(case, ReviewAction.Action.FLAGGED, actor, reasons=case.flag_reasons,
         **({'draft_kept': str(current.pk)} if current else {}))
    case.save(update_fields=['status', 'flag_reasons', 'updated_at'])


def _release(case, decision: Decision, draft, actor=None) -> None:
    """What held the case has cleared: the kept draft is ready again, unchanged."""
    case.status = ResultsCase.Status.DRAFTED
    case.flag_reasons = [*decision.flags, *_prescription_flags(case, draft)]
    _log(case, ReviewAction.Action.REROUTED, actor, draft=str(draft.pk))
    case.save(update_fields=['status', 'flag_reasons', 'flags_overridden', 'updated_at'])


def _can_release(case, decision: Decision, draft) -> bool:
    return (case.status == ResultsCase.Status.FLAGGED and decision.status == ResultsCase.Status.DRAFTED
            and draft is not None and decision.route == case.route)


@transaction.atomic
def _reroute(case_pk, actor=None, rule_errors=()) -> None:
    case = ResultsCase.objects.select_for_update().select_related('report__patient').get(pk=case_pk)
    report = case.report
    if case.status not in OPEN_STATUSES:
        return
    if case.kind == ResultsCase.Kind.REPORT and (report is None or report.status == InvestigationReport.Status.PENDING):
        return
    decision = decide(report, case, ignore_flags=case.flags_overridden, rule_errors=rule_errors)
    draft = case.current_draft
    if decision.status == case.status and (decision.status == ResultsCase.Status.DRAFTED
                                           or decision.flags == list(case.flag_reasons)):
        return  # nothing changed; a draft the doctor may have edited is kept
    if decision.status == ResultsCase.Status.FLAGGED and draft is not None and _holds_only(decision.flags):
        _hold(case, decision.flags, actor)
    elif _can_release(case, decision, draft):
        _release(case, decision, draft, actor)
    else:
        _log(case, ReviewAction.Action.REROUTED, actor)
        _apply(case, decision, actor=actor)


def reroute_open_cases(patient, *, actor=None, rule_errors=(), exclude=None) -> None:
    """
    Route the patient's open results cases again, e.g. after a form was submitted, the rules ran or
    an answer alert was acknowledged, so each case shows (or drops) the patient's flags. Safe to call
    at any time: it never raises, never reopens a closed case and keeps a draft whose routing is
    unchanged, also while an alert holds it. `rule_errors` are those of the run just made.
    """
    try:
        with transaction.atomic():
            cases = ResultsCase.objects.filter(patient=patient, status__in=OPEN_STATUSES)
            if exclude is not None:
                cases = cases.exclude(pk=exclude)
            pks = list(cases.values_list('pk', flat=True))
    except Exception:  # noqa: BLE001 - the caller's work (a form submit) is already saved
        logger.exception('Could not list the open cases of patient %s', getattr(patient, 'pk', None))
        return
    for pk in pks:
        try:
            _reroute(pk, actor, rule_errors)
        except Exception:  # noqa: BLE001 - one case must not stop the others
            logger.exception('Could not route case %s again', pk)


def _section_picks(draft) -> dict[str, list]:
    """{section key: [prescription version]} chosen on a draft."""
    picks = {}
    if draft is not None:
        for row in draft.section_prescriptions.select_related('prescription').order_by('section_key', 'created_at'):
            picks.setdefault(row.section_key, []).append(row.prescription)
    return picks


def _apply(case, decision: Decision, *, actor=None, **draft_options):
    if 'section_prescriptions' not in draft_options:
        # The doctor's per-infection picks survive every rebuild.
        draft_options['section_prescriptions'] = _section_picks(case.current_draft)
    if case.kind == ResultsCase.Kind.REPLY and 'prescriptions' not in draft_options:
        current = case.current_draft
        draft_options['prescriptions'] = (list(current.prescriptions.all()) if current
                                          else last_prescriptions(case.patient))
    case.drafts.filter(is_current=True).update(is_current=False)
    case.forget_drafts()
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
            # Warnings that do not stop the draft being sent, shown on the case.
            warnings = _prescription_flags(case, draft)
            case.flag_reasons = [*decision.flags, *warnings]
            _log(case, ReviewAction.Action.DRAFTED, actor, draft=str(draft.pk), route=case.route,
                 templates=decision.keys, **({'flags': warnings} if warnings else {}))
    elif decision.status == ResultsCase.Status.FLAGGED:
        _log(case, ReviewAction.Action.FLAGGED, actor, reasons=decision.flags)
    case.save(update_fields=['route', 'flag_reasons', 'status', 'flags_overridden', 'updated_at'])


def _lock_open(case) -> ResultsCase:
    """The case, locked for this transaction; refused once it is sending, sent or rejected."""
    locked = ResultsCase.objects.select_for_update().get(pk=case.pk)
    if locked.status not in OPEN_STATUSES:
        raise ReviewError('not_editable', 'This case is closed.', status=409)
    return locked


def _sync(case, locked) -> None:
    """Bring the caller's copy of the case up to date with the locked one that was changed."""
    if case is locked:
        return
    for name in ('status', 'route', 'flag_reasons', 'flags_overridden', 'plan_template_id'):
        setattr(case, name, getattr(locked, name))
    case.forget_drafts()


def _rule_version(organization, answer_check: str):
    """The current version of the clinic's rule linked to this answer check, or None."""
    for rule in AlertRule.objects.filter(organization=organization).prefetch_related('versions'):
        version = max(rule.versions.all(), key=lambda v: v.number, default=None)
        if version is not None and version.answer_check == answer_check:
            return version
    return None


def _prescription_flags(case, draft) -> list[str]:
    """R11 at draft time: a progesterone in peanut oil chosen for a patient with a peanut allergy."""
    names = [p.drug for p in draft.prescriptions.all()]
    if not names:
        return []
    from product.medicines import matches_terms

    version = _rule_version(case.organization, PEANUT_CHECK)
    if version is None or not version.enabled or not matches_terms(names, version.medicine_terms):
        return []
    try:
        from product.intake.history import patient_history

        allergic = patient_history(case.patient).merged('peanut_allergy') == 'yes'
    except Exception:  # noqa: BLE001 - the allergy cannot be ruled out, so the doctor is told
        logger.exception('Could not read the peanut allergy answer for case %s', case.pk)
        allergic = True
    return ['peanut_allergy_prometrium'] if allergic else []


# --- Wording --------------------------------------------------------------------------------------

@dataclass
class _Resolved:
    template: EmailTemplate | None
    # None only for the signature taken from the clinic profile.
    version: EmailTemplateVersion | None
    subject: str
    body: str
    # No current translation: the English wording stands in.
    missing: bool = False


class _Wording:
    """
    The wording of every template and system phrase one draft uses, in the draft's language. It
    records the keys with no approved English wording and those with no current translation.
    """

    def __init__(self, case, language):
        self.case, self.language = case, language
        self.profile = ClinicProfile.objects.filter(organization=case.organization).first()
        self.missing: list[str] = []
        self.not_approved: list[str] = []
        self.used: list[EmailTemplateVersion] = []
        self._templates = None
        self._case_versions = None
        self._resolved = {}

    def template(self, key, language):
        if self._templates is None:
            self._templates = {
                (t.key, t.language): t for t in EmailTemplate.objects.filter(
                    organization=self.case.organization, archived=False,
                ).prefetch_related('default_leaflets')
            }
        return self._templates.get((key, language))

    def label(self, key) -> str:
        template = self.template(key, Language.ENGLISH)
        if template is not None:
            return template.name
        return STARTER_PHRASES[key][0] if key in STARTER_PHRASES else key

    def source(self, key) -> _Resolved | None:
        """The approved English wording; for the signature without one, the clinic profile's signature."""
        template = self.template(key, Language.ENGLISH)
        version = template.approved if template else None
        if version is not None:
            return _Resolved(template, version, version.subject, version.body)
        if key == SIGNATURE and self.profile and self.profile.signature.strip():
            return _Resolved(None, None, '', self.profile.signature.strip())
        return None

    def _case_translation(self, key):
        if self._case_versions is None:
            self._case_versions = {
                row.template_key: row.version for row in
                CaseTranslation.objects.filter(case=self.case, language=self.language).select_related('version')
            } if self.case.pk else {}
        return self._case_versions.get(key)

    def _is_current(self, candidate, english: _Resolved) -> bool:
        """A translation is current while the English it was made from is still the approved English."""
        if candidate is None:
            return False
        if candidate.translated_from_id is not None:
            return english.version is not None and candidate.translated_from_id == english.version.pk
        # Made before translated_from was recorded, or from the profile signature: current only if
        # written after the English was approved (or the profile last changed).
        since = english.version.approved_at if english.version else self.profile.updated_at
        return since is not None and (candidate.approved_at or candidate.created_at) > since

    def resolve(self, key) -> _Resolved | None:
        if key not in self._resolved:
            self._resolved[key] = self._resolve(key)
        return self._resolved[key]

    def _resolve(self, key) -> _Resolved | None:
        english = self.source(key)
        if english is None or self.language == Language.ENGLISH:
            return english
        translated = self.template(key, self.language)
        for candidate in (self._case_translation(key), translated.approved if translated else None):
            if self._is_current(candidate, english):
                return _Resolved(translated or candidate.template, candidate, candidate.subject, candidate.body)
        english.missing = True
        return english

    def _use(self, key, resolved: _Resolved | None) -> _Resolved | None:
        if resolved is None:
            if key != SIGNATURE:  # no signature anywhere simply means none is added
                self.not_approved.append(key)
            return None
        if resolved.missing and key not in self.missing:
            self.missing.append(key)
        if resolved.version is not None and resolved.version not in self.used:
            self.used.append(resolved.version)
        return resolved

    def part(self, key) -> _Resolved | None:
        return self._use(key, self.resolve(key))

    def phrase(self, key, **values) -> str:
        """A system phrase in the draft's language. Never filled from code: missing is recorded instead."""
        resolved = self._use(key, self.resolve(key))
        if resolved is None:
            return ''
        return render(resolved.body, values).text.strip() if values else resolved.body.strip()


class _Values(dict):
    """Placeholder values; a callable is worked out only when a template uses that placeholder."""

    def get(self, key, default=None):
        value = super().get(key, default)
        if callable(value):
            value = value()
            self[key] = value
        return value


# --- Drafting -------------------------------------------------------------------------------------

def _number(value) -> str:
    """13.0000 → 13, 0.4000 → 0.4."""
    return format(value.normalize(), 'f')


_FLAG_PHRASES = {'H': 'phrase.flag_high', 'L': 'phrase.flag_low', 'A': 'phrase.flag_abnormal'}


def _value_line(v, wording: _Wording) -> str:
    name = _inert(v.lab_test.name if v.lab_test else v.raw_name)
    if v.unreadable:
        return f'{name}: {wording.phrase("phrase.could_not_be_read")}'
    value = _inert(f'{v.value_text} {v.unit}'.strip())
    reference = _inert(v.ref_text) or (
        f'{_number(v.ref_low)}–{_number(v.ref_high)}' if v.ref_low is not None and v.ref_high is not None else ''
    )
    line = f'{name}: {value}'
    if v.flag in _FLAG_PHRASES:
        line += f' ({wording.phrase(_FLAG_PHRASES[v.flag])})'
    if reference:
        line += f' ({wording.phrase("phrase.reference", range=reference)})'
    return line


_CHANGE_PHRASES = {Change.UP: 'phrase.change_higher', Change.DOWN: 'phrase.change_lower',
                   Change.SAME: 'phrase.change_unchanged', Change.CHANGED: 'phrase.change_changed'}


def _range_side(v) -> str | None:
    """'H', 'L' or 'N' (within the range); None when the value has no range to be within."""
    if v.flag in {'H', 'L'}:
        return v.flag
    if v.flag == 'N' or v.ref_low is not None or v.ref_high is not None:
        return 'N'
    return None


def _range_phrase(previous, current, change) -> str | None:
    """Where the value now stands against its reference range, from the H/L flags of both values."""
    before, now = _range_side(previous), _range_side(current)
    if before is None or now is None:
        return None
    if now == 'H' and before != 'H':
        return 'phrase.above_range'
    if now == 'L' and before != 'L':
        return 'phrase.below_range'
    if now == 'N':
        return 'phrase.back_within_range' if before in {'H', 'L'} else None
    closer = Change.DOWN if now == 'H' else Change.UP
    if change == closer:
        return 'phrase.toward_range'
    return 'phrase.further_from_range' if change in {Change.UP, Change.DOWN} else None


def _comparison_line(v, result, wording: _Wording) -> str | None:
    if result.previous is None:
        return None
    name = _inert(v.lab_test.name if v.lab_test else v.raw_name)
    before = _inert(f'{result.previous.value_text} {result.previous.unit}'.strip())
    now = _inert(f'{v.value_text} {v.unit}'.strip())
    when_before, when_now = _day(result.previous.result_date, wording.language), _day(v.result_date, wording.language)
    if result.change == Change.NOT_COMPARABLE:
        # Shown side by side, never as a stated change.
        return f'{name}: {before} ({when_before}), {now} ({when_now}) ({wording.phrase("phrase.not_compared")})'
    notes = [wording.phrase(_CHANGE_PHRASES[result.change])]
    state = _range_phrase(result.previous, v, result.change)
    if state:
        notes.append(wording.phrase(state))
    if 'lab_differs' in result.notes and len(result.labs) == 2:
        current_lab, previous_lab = result.labs
        notes.append(wording.phrase('phrase.different_lab', labs=_inert(f'{previous_lab} → {current_lab}')))
    return f'{name}: {before} ({when_before}) → {now} ({when_now}) ({", ".join(notes)})'


def last_prescriptions(patient):
    """What the patient was last prescribed in a results email: the starting point for answering a question."""
    from .models import SentEmail

    sent = (SentEmail.objects.filter(case__patient=patient, status=SentEmail.Status.SENT, draft__prescriptions__isnull=False)
            .select_related('draft').order_by('-sent_at').first())
    return list(sent.draft.prescriptions.all()) if sent else []


def _prescription_text(prescriptions) -> str:
    return '\n'.join(
        ' '.join(p for p in [v.drug, v.dose] if p) + (f'. {v.directions}' if v.directions else '')
        for v in prescriptions
    )


def draft_values(case: ResultsCase, *, wording: _Wording | None = None, prescriptions=(), follow_up: str = '') -> _Values:
    from product.mail.services import visible_text

    wording = wording or _Wording(case, Language.ENGLISH)
    language = wording.language
    report, patient = case.report, case.patient
    values = list(report.values.select_related('lab_test').order_by('position')) if report else []
    profile = wording.profile

    def out_of_range():
        lines = [_value_line(v, wording) for v in values if v.is_abnormal]
        return '\n'.join(lines) or wording.phrase('phrase.all_within_range')

    def comparison_table():
        compared = compare_many([v for v in values if v.lab_test_id])
        lines = (_comparison_line(v, compared[v.pk], wording) for v in values if v.lab_test_id)
        return '\n'.join(line for line in lines if line)

    # Everything a person wrote (names, the sender's question, the lab's printout, the follow-up) is
    # made inert, so it can never be read as a placeholder or a blank on this render or a later one.
    return _Values({
        'patient.first_name': _inert(patient.full_name.split()[0]) if patient.full_name else '',
        'patient.full_name': _inert(patient.full_name),
        'patient.file_number': patient.file_number,
        'report.date': lambda: _day(report.collected_on, language) if report else '',
        'report.lab': _inert(report.lab_name) if report else '',
        'patient.question': _inert(visible_text(case.inbound_message.body_text)) if case.inbound_message_id else '',
        'results.table': lambda: '\n'.join(_value_line(v, wording) for v in values),
        'results.abnormal': out_of_range,
        'comparison.table': comparison_table,
        'comparison.attention': out_of_range,
        'clinic.name': (profile and profile.display_name) or case.organization.name,
        'clinic.phone': profile.phone if profile else '',
        'doctor.name': profile.doctor_name if profile else '',
        'today': lambda: _day(date.today(), language),
        'prescription': _prescription_text(prescriptions),
        'follow_up': _inert(follow_up.strip()),
    })


def _drop(text: str, name: str) -> str:
    """Remove a placeholder that renders empty, with the line it stood on when it stood alone."""
    pattern = r'\{\{\s*' + re.escape(name) + r'\s*\}\}'
    if not re.search(pattern, text):
        return text
    text = re.sub(r'(?m)^[ \t]*' + pattern + r'[ \t]*(?:\r?\n|$)', '', text)
    return re.sub(r'\n{3,}', '\n\n', re.sub(pattern, '', text))


@transaction.atomic
def build_draft(case, decision: Decision, *, user=None, language=Language.ENGLISH, prescriptions=(),
                section_prescriptions=None, follow_up='', leaflets=None, attach_report=None) -> Draft:
    wording = _Wording(case, language)
    parts = [(key, part) for key in decision.keys if (part := wording.part(key)) is not None]
    if wording.not_approved:
        raise ReviewError('template_not_approved',
                          f'These templates have no approved wording yet: {", ".join(wording.not_approved)}.')
    infection = decision.route == 'infection'
    sections = {key: list(dict.fromkeys(picks)) for key, picks in (section_prescriptions or {}).items()
                if key in decision.keys and key.startswith(STI_SECTION) and picks}
    values = draft_values(case, wording=wording, prescriptions=prescriptions, follow_up=follow_up)
    follow_up = follow_up.strip()
    subject, bodies, open_slots, asks_follow_up = '', [], [], False
    for key, part in parts:
        part_subject, part_body = part.subject, part.body
        asks_follow_up = asks_follow_up or 'follow_up' in placeholder_names(part_subject) | placeholder_names(part_body)
        values.pop('result.name', None)
        values.pop('result.value', None)
        if key in decision.sections:
            values['result.name'], values['result.value'] = (_inert(v) for v in decision.sections[key])
        unshown = ''
        if infection:
            # Each infection section names its own drug; the opening and closing name none.
            if key.startswith(STI_SECTION):
                picked = sections.get(key, ())
                values['prescription'] = _prescription_text(picked)
                if picked and 'prescription' not in placeholder_names(part_subject) | placeholder_names(part_body):
                    # The section's wording has nowhere to name the chosen drug: a blank the doctor must fill.
                    drugs = ', '.join(re.sub(r'[\[\]{}]', '', p.drug) for p in picked)
                    unshown = f'[[Add the prescription to this section: {drugs}]]'
            else:
                part_subject, part_body = _drop(part_subject, 'prescription'), _drop(part_body, 'prescription')
        if not follow_up:
            part_subject, part_body = _drop(part_subject, 'follow_up'), _drop(part_body, 'follow_up')
        if not subject and part_subject:
            rendered_subject = render(part_subject, values)
            subject, open_slots = rendered_subject.text, [*open_slots, *rendered_subject.open_slots]
        rendered = render(part_body, values)
        text = rendered.text.strip()
        if unshown:
            text = f'{text}\n{unshown}' if text else unshown
            rendered.open_slots.extend(render(unshown, {}).open_slots)
        if part.missing:
            # The English stands in until the doctor translates this part.
            text = f'[[{TRANSLATE_SLOT}{wording.label(key)}]]\n\n{text}'
        bodies.append(text)
        open_slots.extend(rendered.open_slots)
    if follow_up and not asks_follow_up:
        bodies.append(wording.phrase('phrase.follow_up_heading', follow_up=_inert(follow_up)))
    body = '\n\n'.join(b for b in bodies if b)
    signature = wording.phrase(SIGNATURE)
    if signature:
        body = f'{body}\n\n{signature}'
    if not subject:
        subject = wording.phrase('phrase.default_subject')
    if wording.not_approved:
        raise ReviewError('phrase_not_approved',
                          f'These system phrases have no approved wording yet: {", ".join(wording.not_approved)}.')
    open_slots = [f'{TRANSLATE_SLOT}{wording.label(key)}' for key in wording.missing] + open_slots

    case.drafts.filter(is_current=True).update(is_current=False)
    case.forget_drafts()
    draft = Draft.objects.create(
        case=case, language=language, subject=subject[:255], body=body,
        open_slots=list(dict.fromkeys(open_slots)), follow_up=follow_up, missing_translations=wording.missing,
        attach_report=bool(attach_report), created_by=user,
    )
    draft.template_versions.set(wording.used)
    if infection:
        DraftSectionPrescription.objects.bulk_create([
            DraftSectionPrescription(draft=draft, section_key=key, prescription=version)
            for key, picks in sections.items() for version in picks
        ])
        prescriptions = [version for key in decision.keys for version in sections.get(key, ())]
    draft.prescriptions.set(list(dict.fromkeys(prescriptions)))
    if leaflets is None:
        defaults = {leaflet for _, part in parts if part.template
                    for leaflet in part.template.default_leaflets.all() if not leaflet.archived}
        leaflets = [leaflet.current for leaflet in defaults if leaflet.current]
    draft.leaflets.set(leaflets)
    return draft


def rebuild(case, *, user, language=None, prescriptions=None, section_prescriptions=None, follow_up=None,
            leaflets=None, attach_report=None, ignore_flags=False):
    """Build a fresh draft, keeping the current draft's choices unless new ones are given."""
    locked = _rebuild(case, user=user, language=language, prescriptions=prescriptions,
                      section_prescriptions=section_prescriptions, follow_up=follow_up, leaflets=leaflets,
                      attach_report=attach_report, ignore_flags=ignore_flags)
    _sync(case, locked)
    if locked.status != ResultsCase.Status.DRAFTED:
        held = _hold_error(locked.flag_reasons)
        if held is not None:
            raise held
        raise ReviewError(locked.flag_reasons[0] if locked.flag_reasons else 'cannot_draft',
                          'The draft could not be built; see the case flags.', status=409)
    return locked.current_draft


_HOLD_TEXT = {
    'values_need_check': 'A value in this report has not been checked yet. The case is back in "Needs the doctor": '
                         'check each marked value (Check this value).',
    'red_alert_open': 'A red alert is open for this patient{names}. The case is back in "Needs the doctor": '
                      'acknowledge the alert in the alerts panel, or choose Draft anyway after reading it.',
    'alert_rules_not_checked': "The alert rules could not be checked on the patient's latest form. The case is back "
                               'in "Needs the doctor": run Check alerts now, or choose Draft anyway.',
}


def _hold_error(flags, alerts=()) -> ReviewError | None:
    """The refusal for a case held by these flags, naming only what the doctor can now do; None for other flags."""
    if any(f in VALUE_FLAGS for f in flags):
        code = 'values_need_check'
    elif any(f.startswith('red_alert_') for f in flags):
        code = 'red_alert_open'
    elif 'alert_rules_not_checked' in flags:
        code = 'alert_rules_not_checked'
    else:
        return None
    names = ', '.join(dict.fromkeys(a.rule.code for a in alerts))
    return ReviewError(code, _HOLD_TEXT[code].format(names=f' ({names})' if names else ''), status=409,
                       context={'alerts': [str(a.pk) for a in alerts]} if alerts else None)


@transaction.atomic
def _rebuild(case, *, user, language, prescriptions, section_prescriptions, follow_up, leaflets, attach_report,
             ignore_flags) -> ResultsCase:
    # Locked and re-read: a closed case is never drafted again, and a send in flight is never overwritten.
    case = _lock_open(case)
    current = case.current_draft
    if ignore_flags:
        case.flags_overridden = True
    decision = decide(case.report, case, ignore_flags=case.flags_overridden)
    if decision.status == ResultsCase.Status.FLAGGED and _holds_only(decision.flags):
        # Shown on the case (its draft kept), so the doctor can act on it; rebuild() then refuses.
        if case.status != ResultsCase.Status.FLAGGED or list(case.flag_reasons) != decision.flags:
            _hold(case, decision.flags, user)
        return case
    if decision.status != ResultsCase.Status.DRAFTED:
        raise ReviewError('cannot_draft', 'This case cannot be drafted yet.', status=409)
    sections = _section_picks(current)
    if section_prescriptions is not None:
        allowed = {key for key in decision.keys if key.startswith(STI_SECTION)}
        unknown = sorted(set(section_prescriptions) - allowed)
        if unknown:
            raise ReviewError('invalid_section', 'These are not positive results in this email: '
                              + ', '.join(unknown) + '.')
        sections.update(section_prescriptions)
    if decision.route == 'infection' and prescriptions:
        raise ReviewError('use_section_prescriptions', 'Choose the prescription for each positive result.')
    options = {
        'language': language or (current.language if current else Language.ENGLISH),
        'prescriptions': prescriptions if prescriptions is not None else (
            list(current.prescriptions.all()) if current
            else last_prescriptions(case.patient) if case.kind == ResultsCase.Kind.REPLY else []),
        'section_prescriptions': sections,
        'follow_up': follow_up if follow_up is not None else (current.follow_up if current else ''),
        'leaflets': leaflets if leaflets is not None else (list(current.leaflets.all()) if current else None),
        'attach_report': attach_report if attach_report is not None else (current.attach_report if current else False),
    }
    _apply(case, decision, actor=user, **options)
    return case


@transaction.atomic
def edit_draft(case, *, user, subject=None, body=None, leaflets=None, attach_report=None) -> Draft:
    case = ResultsCase.objects.select_for_update().get(pk=case.pk)
    draft = case.current_draft
    if case.status != ResultsCase.Status.DRAFTED or draft is None:
        raise ReviewError('not_editable', 'Only a draft waiting for review can be edited.', status=409)
    values = draft_values(case, wording=_Wording(case, draft.language),
                          prescriptions=list(draft.prescriptions.all()), follow_up=draft.follow_up)
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
    # Untranslated parts stay listed whatever the text says: only a rebuild changes missing_translations.
    translate = [slot for slot in draft.open_slots if slot.startswith(TRANSLATE_SLOT)]
    draft.open_slots = list(dict.fromkeys(
        translate + render(draft.subject, {}).open_slots + render(draft.body, {}).open_slots))
    draft.edited = draft.edited or bool({'subject', 'body'} & set(changed))
    draft.save()
    _log(case, ReviewAction.Action.EDITED, user, fields=changed)
    return draft


@transaction.atomic
def choose_plan(case, template: EmailTemplate, *, user) -> ResultsCase:
    if case.report is None or case.report.report_type != ReportType.SMEAR_ABNORMAL:
        raise ReviewError('not_a_smear', 'Only an abnormal smear needs a plan.', status=409)
    locked = _lock_open(case)
    if template.key not in SMEAR_PLAN_KEYS:
        raise ReviewError('invalid_plan', 'Choose one of the cervical smear sections 2 to 14.')
    locked.plan_template = template
    locked.save(update_fields=['plan_template', 'updated_at'])
    _log(locked, ReviewAction.Action.PLAN_CHOSEN, user, template=template.key)
    _apply(locked, decide(locked.report, locked), actor=user)
    _sync(case, locked)
    case.plan_template = template
    return case


# --- Translation (Arabic drafts) ------------------------------------------------------------------

def _translatable_draft(case) -> Draft:
    draft = case.current_draft
    if case.status != ResultsCase.Status.DRAFTED or draft is None:
        raise ReviewError('not_editable', 'Only a draft waiting for review can be translated.', status=409)
    return draft


def translation_sources(case) -> list[dict]:
    """For each part still missing a translation: the English to translate, with its placeholders."""
    from .translation import get_translator

    draft = _translatable_draft(case)
    wording, translator = _Wording(case, draft.language), get_translator()
    items = []
    for key in draft.missing_translations:
        english = wording.source(key)
        if english is None:
            continue
        suggestion = None
        body = translator.suggest(english.body, source=Language.ENGLISH, target=draft.language)
        if body:
            subject = (translator.suggest(english.subject, source=Language.ENGLISH, target=draft.language)
                       if english.subject else '')
            suggestion = {'subject': subject or '', 'body': body}
        items.append({
            'key': key, 'name': wording.label(key), 'is_phrase': key.startswith('phrase.'),
            'subject': english.subject, 'body': english.body,
            'english_version': english.version.number if english.version else None,
            'placeholders': sorted(placeholder_names(english.subject) | placeholder_names(english.body)),
            'suggestion': suggestion,
        })
    return items


@transaction.atomic
def save_translation(case, *, user, key: str, body: str, subject: str = '', keep_for_future: bool = False) -> Draft:
    """
    Save the doctor's translation of one part as a new version of the translated template, linked
    to the English version it was made from and used for this case. With `keep_for_future` it is
    also approved, so later drafts in that language reuse it.
    """
    # Locked and re-read, so the status is checked on the case as it is now.
    case = _lock_open(case)
    draft = _translatable_draft(case)
    if key not in draft.missing_translations:
        raise ReviewError('not_missing', 'This part does not need translating.')
    language = draft.language
    wording = _Wording(case, language)
    english = wording.source(key)
    if english is None:
        raise ReviewError('not_missing', 'This part has no approved English wording to translate.')
    expected = placeholder_names(english.subject) | placeholder_names(english.body)
    given = placeholder_names(subject) | placeholder_names(body)
    if given != expected:
        listed = ', '.join(f'{{{{{name}}}}}' for name in sorted(expected)) or 'none'
        raise ReviewError('placeholders_differ', f'Keep exactly the placeholders of the English wording: {listed}.')
    if english.subject.strip() and not subject.strip():
        raise ReviewError('subject_required', 'Translate the subject too.')
    allowed = allowed_placeholders(key)
    problems = validate_text(subject, allowed) + validate_text(body, allowed)
    if problems:
        raise ReviewError('invalid_wording', ' '.join(problems))

    source = english.template
    template, created = EmailTemplate.objects.get_or_create(
        organization=case.organization, key=key, language=language,
        defaults=dict(
            name=source.name, kind=source.kind, part=source.part, section_key=source.section_key,
            sort_order=source.sort_order,
        ) if source else dict(name=wording.label(key), kind=TemplateKind.PHRASE),
    )
    if created and source:
        template.default_leaflets.set(source.default_leaflets.all())
    EmailTemplate.objects.select_for_update().get(pk=template.pk)
    latest = template.versions.order_by('-number').first()
    version = EmailTemplateVersion.objects.create(
        template=template, number=(latest.number + 1) if latest else 1, subject=subject, body=body,
        translated_from=english.version, note=f'Translated in review, case {case.pk}'[:255], created_by=user,
        approved_by=user if keep_for_future else None, approved_at=timezone.now() if keep_for_future else None,
    )
    CaseTranslation.objects.update_or_create(case=case, template_key=key, language=language,
                                             defaults={'version': version})
    _log(case, ReviewAction.Action.ARABIC_DRAFTED, user, key=key, version=version.number, kept=keep_for_future)
    return rebuild(case, user=user)


@transaction.atomic
def reject(case, *, user, reason: str) -> ResultsCase:
    # Locked, so rejecting cannot cross an approval in flight: whichever gets the row first wins.
    locked = ResultsCase.objects.select_for_update().get(pk=case.pk)
    if locked.status in {ResultsCase.Status.SENDING, ResultsCase.Status.SENT}:
        raise ReviewError('already_sent', 'This email has already been sent.', status=409)
    case.status = locked.status = ResultsCase.Status.REJECTED
    locked.save(update_fields=['status', 'updated_at'])
    locked.drafts.filter(is_current=True).update(is_current=False)
    case.forget_drafts()
    _log(locked, ReviewAction.Action.REJECTED, user, reason=reason)
    return case


@transaction.atomic
def open_reply_case(message):
    """
    A patient asked about a prescription: open a case drafted from the prescription reply template,
    starting from what they were last prescribed. It is reviewed and approved like any other draft.
    """
    if ResultsCase.objects.filter(inbound_message=message).exists():
        return None
    patient = message.thread.patient
    case = ResultsCase.objects.create(
        organization=message.organization, patient=patient, kind=ResultsCase.Kind.REPLY, inbound_message=message,
        status=ResultsCase.Status.FLAGGED,
    )
    _log(case, ReviewAction.Action.OPENED, None, message=str(message.pk))
    _apply(case, decide(None, case), prescriptions=last_prescriptions(patient))
    return case


def draft_anyway(case, *, user, reason: str) -> Draft:
    """
    The doctor has looked at a flagged case and wants a draft anyway. Values still to be checked are
    never skipped this way: each is confirmed or corrected with "Check this value".
    """
    with transaction.atomic():
        locked = _lock_open(case)
        if locked.status != ResultsCase.Status.FLAGGED:
            raise ReviewError('not_flagged', 'Only a flagged case can be drafted anyway.', status=409)
        unchecked = _value_flags(locked.report)
        if unchecked:
            raise ReviewError('values_need_check', 'Check each uncertain or unreadable value first '
                              '(Check this value); drafting anyway does not skip them.', status=409)
        _log(locked, ReviewAction.Action.DRAFTED_ANYWAY, user, reason=reason, flags=locked.flag_reasons)
        draft = locked.current_draft
        if draft is not None:
            # Held after drafting: the kept draft (with any edits) is ready again unless the routing changed.
            locked.flags_overridden = True
            decision = decide(locked.report, locked, ignore_flags=True)
            if _can_release(locked, decision, draft):
                _release(locked, decision, draft, user)
                _sync(case, locked)
                return draft
    return rebuild(case, user=user, ignore_flags=True)


def _recipient(case, user, send_to_thread_contact: bool):
    """
    (address, confirmed_by). Results go to the patient's own address; a reply goes back to whoever
    wrote when that is the patient's own address. Anyone else (a relative writing in the patient's
    thread, whatever the thread says) gets it only when the doctor confirms; otherwise the patient does.
    """
    from product.mail.services import sender_is_patient

    if case.inbound_message_id:
        message = case.inbound_message
        if sender_is_patient(message.from_address, case.patient):
            return message.from_address, None
        if send_to_thread_contact:
            return message.from_address, user
    return case.patient.email, None


def _send_blocks(case) -> tuple[ReviewError, list[str]] | None:
    """
    What about the case's values or the patient, checked again at the moment of sending, stops it:
    (the refusal, the flags the case is held with), or None.
    """
    report = case.report if case.report_id else None
    flags = _value_flags(report)
    if flags:
        return _hold_error(flags), flags
    # "Draft anyway" covers only what the doctor saw: an alert opened after it still stops the send.
    since = (_override_at(case) or timezone.now()) if case.flags_overridden else None
    alerts = _red_alerts(report, case.patient, since=since)
    if alerts:
        flags = [f for f in _alert_flags(report, case.patient, since=since) if f.startswith('red_alert_')]
        return _hold_error(['red_alert_open'], alerts), flags or ['red_alert_open']
    if report is not None and _rules_not_checked(case.patient, since=since):
        return _hold_error(['alert_rules_not_checked']), ['alert_rules_not_checked']
    return None


def approve_and_send(case, *, user, send_to_thread_contact: bool = False):
    """
    The only way a results email leaves the clinic: the doctor approves the current draft. There
    is deliberately no setting, task or rule that sends without this call. When an alert, an unchecked
    rule run or an unchecked value stops it, the case goes back to the doctor flagged with it (its
    draft kept) and the refusal is raised; nothing is sent.
    """
    result = _approve(case, user=user, send_to_thread_contact=send_to_thread_contact)
    if isinstance(result, ReviewError):
        raise result
    return result


@transaction.atomic
def _approve(case, *, user, send_to_thread_contact):
    from .models import SentEmail
    from .tasks import send_case_email

    case = ResultsCase.objects.select_for_update().get(pk=case.pk)
    draft = case.current_draft
    if case.status != ResultsCase.Status.DRAFTED or draft is None:
        raise ReviewError('not_ready', 'There is no draft waiting for approval.', status=409)
    if draft.missing_translations:
        # Checked on its own: editing the marker out of the text never makes a mixed-language email sendable.
        raise ReviewError('missing_translations', 'Translate every listed part first: '
                          + ', '.join(draft.missing_translations) + '.', status=409)
    if draft.open_slots:
        raise ReviewError('open_slots', 'Fill in every highlighted blank first: ' + ', '.join(draft.open_slots) + '.')
    blocked = _send_blocks(case)
    if blocked is not None:
        refusal, flags = blocked
        _hold(case, flags, user)  # committed with the refusal, so the doctor sees why and what to do
        return refusal
    from product.mail.transport import can_send

    to_address, confirmed_by = _recipient(case, user, send_to_thread_contact)
    if not to_address:
        raise ReviewError('no_patient_email', "The patient's file has no email address.")
    if not can_send(case.organization):
        raise ReviewError('mailbox_not_set_up', 'Set up the clinic mailbox before sending (Inbox → Mailbox settings).')
    sent = SentEmail.objects.create(
        case=case, draft=draft, to_address=to_address, from_address='', subject=draft.subject,
        body=draft.body, approved_by=user, to_thread_contact_confirmed_by=confirmed_by,
        attachments=[{'kind': 'leaflet', 'id': str(v.pk), 'name': v.original_filename} for v in draft.leaflets.all()]
        + ([{'kind': 'report', 'id': str(case.report.document_id), 'name': case.report.document.original_filename}]
           if draft.attach_report and case.report_id else []),
    )
    case.status = ResultsCase.Status.SENDING
    case.save(update_fields=['status', 'updated_at'])
    _log(case, ReviewAction.Action.APPROVED, user, sent_email=str(sent.pk), draft=str(draft.pk),
         **({'to_thread_contact': True} if confirmed_by else {}))
    transaction.on_commit(lambda: send_case_email.delay(str(sent.pk)))
    return sent
