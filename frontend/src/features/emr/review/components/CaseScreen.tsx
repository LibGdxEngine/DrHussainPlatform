"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { contentApi, type Leaflet, type Prescription } from "@/lib/api/emr/content";
import { documentsApi, type PatientDocument } from "@/lib/api/emr/documents";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { resultsApi } from "@/lib/api/emr/results";
import { reviewApi, type Draft, type ResultsCaseDetail } from "@/lib/api/emr/review";
import { DocumentPreview } from "../../documents/components/DocumentPreview";
import { formatDay } from "../../format";
import { reportTypeLabel } from "../../results/labels";
import { ResultValuesTable } from "../../results/components/ResultValuesTable";
import { emrRoutes } from "../../routes";
import { Notice, type NoticeState } from "../../settings/components/Notice";
import { ActionButton } from "../../ui/Action";
import { ChipGroup } from "../../ui/ChipGroup";
import { Field, TextArea, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { actionLabel, caseFlag, caseStatus, routeLabel } from "../labels";

function reviewError(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 403) return "Only the doctor can do this.";
  return apiErrorMessage(err, fallback);
}

/** One case: the original report, the values read from it, and the draft, side by side. */
export function CaseScreen({ caseId }: { caseId: string }) {
  const [loaded, setLoaded] = useState<{ id: string; detail?: ResultsCaseDetail; error?: string } | null>(null);
  const [document, setDocument] = useState<PatientDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    reviewApi.get(caseId).then(
      (detail) => {
        if (cancelled) return;
        setLoaded({ id: caseId, detail });
        documentsApi.get(detail.report.document).then((d) => !cancelled && setDocument(d), () => undefined);
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ id: caseId, error: apiErrorMessage(err, "Could not open the case.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const detail = loaded?.id === caseId ? loaded.detail : undefined;

  async function act(run: () => Promise<ResultsCaseDetail>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await run();
      setLoaded({ id: caseId, detail: next });
      setNotice({ tone: "ok", text: done });
      return true;
    } catch (err) {
      setNotice({ tone: "error", text: reviewError(err, "Could not save.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <Panel className="p-6">
        <p className="m-0 text-sm text-muted">{loaded?.error ?? "Opening the case…"}</p>
        {loaded?.error ? <Link href={emrRoutes.results} className="text-sm text-brand">Back to the queue</Link> : null}
      </Panel>
    );
  }

  const s = caseStatus[detail.status];
  const report = detail.report_detail;
  return (
    <>
      <Panel as="header" className="flex flex-wrap items-center gap-3 p-5">
        <div className="flex flex-col gap-1">
          <Link href={emrRoutes.results} className="text-[13px] text-brand no-underline">← Review queue</Link>
          <h1 className="m-0 text-2xl font-bold">
            {detail.patient.full_name}{" "}
            <span className="font-emr-mono text-sm font-medium text-muted">· {detail.patient.file_number}</span>
          </h1>
          <p className="m-0 text-[13px] text-muted">
            {reportTypeLabel[report.report_type]}
            {report.lab_name ? ` · ${report.lab_name}` : ""}
            {report.collected_on ? ` · sample ${formatDay(report.collected_on)}` : ""}
            {detail.route ? ` · ${routeLabel[detail.route] ?? detail.route}` : ""}
          </p>
        </div>
        <Pill tone={s.tone} size="md" className="ms-auto">{s.label}</Pill>
      </Panel>
      <Notice notice={notice} />
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-2">
        <Panel aria-label="Original report" className="flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">Original report</h2>
          {document ? <DocumentPreview document={document} /> : <p className="m-0 text-[13px] text-muted">Loading…</p>}
          <Link href={`${emrRoutes.docs}?patient=${encodeURIComponent(detail.patient.file_number)}`} className="text-[13px] text-brand">
            Open the patient&apos;s documents
          </Link>
        </Panel>
        <Panel aria-label="Values" className="flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">Values read from the report</h2>
          {report.values.length ? (
            <ResultValuesTable values={report.values} />
          ) : (
            <p className="m-0 text-[13px] text-muted">No values were read.</p>
          )}
        </Panel>
        <div className="flex flex-col gap-4 xl:col-span-2 2xl:col-span-1">
          <DecisionPanel detail={detail} busy={busy} act={act} />
          <ActionLog detail={detail} />
        </div>
      </div>
    </>
  );
}

type Act = (run: () => Promise<ResultsCaseDetail>, done: string) => Promise<boolean>;

function DecisionPanel({ detail, busy, act }: { detail: ResultsCaseDetail; busy: boolean; act: Act }) {
  if (detail.status === "flagged") return <FlaggedPanel detail={detail} busy={busy} act={act} />;
  if (detail.status === "awaiting_plan") return <PlanPanel detail={detail} busy={busy} act={act} />;
  if (detail.status === "drafted" && detail.draft) {
    return <DraftPanel key={detail.draft.id} detail={detail} draft={detail.draft} busy={busy} act={act} />;
  }
  return <SentPanel detail={detail} />;
}

function FlaggedPanel({ detail, busy, act }: { detail: ResultsCaseDetail; busy: boolean; act: Act }) {
  const [reason, setReason] = useState("");
  const patientDoubt = detail.flag_reasons.some((r) => r.startsWith("patient_"));
  const smear = detail.report_detail.report_type === "smear_abnormal";
  return (
    <Panel aria-label="Needs the doctor" className="flex flex-col gap-3 p-5">
      <h2 className="m-0 text-lg font-semibold">Needs the doctor</h2>
      <p className="m-0 text-[13px] text-muted">No draft was made. Check the report and values first.</p>
      <ul className="m-0 flex flex-col gap-1 rounded-xl bg-warn-wash px-3 py-2.5 ps-7 text-[13px] text-warn-ink">
        {detail.flag_reasons.map((r) => <li key={r}>{caseFlag(r)}</li>)}
      </ul>
      {patientDoubt ? (
        <ActionButton
          disabled={busy}
          className="self-start"
          onClick={() =>
            void act(async () => {
              await resultsApi.confirm(detail.report.id);
              return reviewApi.get(detail.id);
            }, "Confirmed as this patient's report. The case was routed again.")
          }
        >
          Confirm it is this patient
        </ActionButton>
      ) : null}
      {!patientDoubt && !smear ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Field label="Draft anyway: why is this report fine to answer?">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vitamin D not needed" />
          </Field>
          <ActionButton
            variant="quiet"
            disabled={busy || !reason.trim()}
            className="self-start"
            onClick={() => void act(() => reviewApi.draftAnyway(detail.id, reason), "Draft built.")}
          >
            Draft anyway
          </ActionButton>
        </div>
      ) : null}
      <RejectBox detail={detail} busy={busy} act={act} />
    </Panel>
  );
}

function PlanPanel({ detail, busy, act }: { detail: ResultsCaseDetail; busy: boolean; act: Act }) {
  return (
    <Panel aria-label="Choose the plan" className="flex flex-col gap-3 p-5">
      <h2 className="m-0 text-lg font-semibold">Abnormal smear: choose the plan</h2>
      <p className="m-0 text-[13px] leading-[1.7] text-muted">
        Repeat in 12 months or less, or colposcopy, then possibly cryotherapy or LLETZ. The matching cervical smear
        email (sections 2 to 14) is drafted after you choose.
      </p>
      <div className="flex flex-col gap-1.5">
        {detail.smear_plans.map((plan) => (
          <button
            key={plan.key}
            type="button"
            disabled={busy || !plan.approved}
            onClick={() => void act(() => reviewApi.choosePlan(detail.id, plan.key), `Plan chosen: ${plan.name}.`)}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-start text-[13px] hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {plan.name}
            {!plan.approved ? <span className="ms-auto text-xs text-muted">No approved wording yet</span> : null}
          </button>
        ))}
      </div>
      <RejectBox detail={detail} busy={busy} act={act} />
    </Panel>
  );
}

function DraftPanel({ detail, draft, busy, act }: { detail: ResultsCaseDetail; draft: Draft; busy: boolean; act: Act }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [leaflets, setLeaflets] = useState<Leaflet[]>([]);
  const [chosen, setChosen] = useState<string[]>(draft.prescriptions.map((p) => p.item));
  const [followUp, setFollowUp] = useState(draft.follow_up ?? "");
  const dirty = subject !== draft.subject || body !== draft.body;
  const optionsChanged =
    followUp !== (draft.follow_up ?? "") ||
    chosen.slice().sort().join() !== draft.prescriptions.map((p) => p.item).sort().join();
  const attached = useMemo(() => new Set(draft.leaflets.map((l) => l.leaflet)), [draft.leaflets]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([contentApi.prescriptions.list(), contentApi.leaflets.list()]).then(
      ([p, l]) => {
        if (cancelled) return;
        setPrescriptions(p);
        setLeaflets(l);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const rebuild = (changes: Parameters<typeof reviewApi.options>[1], done: string) => {
    if (draft.edited && !window.confirm("Rebuilding the draft replaces your edits to the wording. Continue?")) return;
    void act(() => reviewApi.options(detail.id, changes), done);
  };

  return (
    <Panel aria-label="Draft" className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-lg font-semibold">Draft email</h2>
        <Pill tone="neutral" size="xs">{draft.language === "ar" ? "Arabic" : "English"}</Pill>
        {draft.edited ? <Pill tone="brand" size="xs">Edited</Pill> : null}
        <span className="ms-auto text-xs text-muted">To {detail.patient.email || "— no email on file"}</span>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border border-line p-3.5">
        <legend className="px-1 text-[13px] font-medium text-ink-2">Choices (rebuild the draft)</legend>
        {prescriptions.length ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Prescription</span>
            {prescriptions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={chosen.includes(p.id)}
                  onChange={() => setChosen((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                />
                {p.drug}{p.dose ? `, ${p.dose}` : ""}
              </label>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">No prescriptions in Clinic settings yet.</span>
        )}
        <Field label="Follow-up to offer">
          <TextInput value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g. Repeat bloods in 3 months" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            size="sm"
            disabled={busy || !optionsChanged}
            onClick={() => rebuild({ prescriptions: chosen, follow_up: followUp }, "Draft rebuilt with your choices.")}
          >
            Rebuild draft
          </ActionButton>
          <ChipGroup
            label="Language"
            options={[{ id: "en", label: "English" }, { id: "ar", label: "Arabic" }]}
            value={draft.language === "ar" ? "ar" : "en"}
            onChange={(language) => rebuild({ language }, language === "ar" ? "Arabic draft built." : "English draft built.")}
          />
        </div>
      </fieldset>

      <Field label="Subject">
        <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} dir="auto" />
      </Field>
      <Field label="Email">
        <TextArea rows={14} value={body} onChange={(e) => setBody(e.target.value)} dir="auto" className="text-[13px]" />
      </Field>
      {draft.open_slots.length ? (
        <div role="alert" className="rounded-xl bg-warn-wash px-3 py-2.5 text-[13px] text-warn-ink">
          <strong className="font-semibold">Fill in before sending:</strong>{" "}
          {draft.open_slots.map((slot) => (
            <mark key={slot} className="mx-0.5 rounded bg-warn-tint px-1 text-warn-ink">{slot}</mark>
          ))}
          <span className="block text-xs">Replace each [[…]] in the email with the right wording, then save.</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Attachments</span>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(draft.attach_report)}
            disabled={busy}
            onChange={(e) => void act(() => reviewApi.edit(detail.id, { attach_report: e.target.checked }), "Attachments saved.")}
          />
          The report itself ({detail.report.document_title})
        </label>
        {leaflets.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={attached.has(l.id)}
              disabled={busy}
              onChange={() => {
                const next = attached.has(l.id) ? [...attached].filter((id) => id !== l.id) : [...attached, l.id];
                void act(() => reviewApi.edit(detail.id, { leaflets: next }), "Attachments saved.");
              }}
            />
            {l.title}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <ActionButton
          variant="quiet"
          disabled={busy || !dirty}
          onClick={() => void act(() => reviewApi.edit(detail.id, { subject, body }), "Edits saved.")}
        >
          Save edits
        </ActionButton>
        <ActionButton
          disabled={busy || dirty || Boolean(draft.open_slots.length) || !detail.patient.email}
          onClick={() => {
            if (window.confirm(`Send this email to ${detail.patient.email}?`)) {
              void act(() => reviewApi.approve(detail.id), "Approved. The email is on its way.");
            }
          }}
        >
          Approve and send
        </ActionButton>
        {dirty ? <span className="text-xs text-warn-ink">Save your edits before approving.</span> : null}
      </div>
      <p className="m-0 text-xs text-muted">
        Built from {draft.template_versions.map((t) => `${t.name} v${t.number}`).join(", ") || "—"}.
      </p>
      <RejectBox detail={detail} busy={busy} act={act} />
    </Panel>
  );
}

function RejectBox({ detail, busy, act }: { detail: ResultsCaseDetail; busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <ActionButton variant="quiet" size="sm" className="self-start" disabled={busy} onClick={() => setOpen(true)}>
        Reject
      </ActionButton>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <Field label="Why is no email being sent?">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Told the patient by phone" />
      </Field>
      <div className="flex gap-2">
        <ActionButton
          size="sm"
          disabled={busy || !reason.trim()}
          onClick={() => void act(() => reviewApi.reject(detail.id, reason), "Rejected. No email will be sent.")}
        >
          Reject
        </ActionButton>
        <ActionButton variant="quiet" size="sm" onClick={() => setOpen(false)}>Cancel</ActionButton>
      </div>
    </div>
  );
}

function SentPanel({ detail }: { detail: ResultsCaseDetail }) {
  const sent = detail.sent_emails[0];
  return (
    <Panel aria-label="Sent email" className="flex flex-col gap-3 p-5">
      <h2 className="m-0 text-lg font-semibold">
        {detail.status === "rejected" ? "Rejected: no email sent" : detail.status === "sending" ? "Sending…" : "Sent"}
      </h2>
      {sent ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas-2 p-4 text-[13px]">
          <span className="text-xs text-muted">
            To {sent.to_address} · approved by {sent.approved_by_name}
            {sent.sent_at ? ` · sent ${formatDay(sent.sent_at)}` : ""}
            {sent.status === "failed" ? ` · failed (${sent.error})` : ""}
          </span>
          <strong className="font-semibold" dir="auto">{sent.subject}</strong>
          <p className="m-0 whitespace-pre-wrap leading-[1.7] text-ink-2" dir="auto">{sent.body}</p>
          {(sent.attachments as { name: string }[]).length ? (
            <span className="text-xs text-muted">
              Attached: {(sent.attachments as { name: string }[]).map((a) => a.name).join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function ActionLog({ detail }: { detail: ResultsCaseDetail }) {
  return (
    <Panel aria-label="History" className="flex flex-col gap-1.5 p-5">
      <h2 className="m-0 text-base font-semibold">History</h2>
      {detail.actions.map((a) => (
        <div key={a.id} className={cn("flex flex-wrap gap-2 border-t border-line-soft pt-1.5 text-xs text-ink-3")}>
          <span className="font-semibold text-ink-2">{actionLabel[a.action] ?? a.action}</span>
          <span>{a.actor_name}</span>
          <span className="ms-auto">{new Date(a.created_at).toLocaleString("en-GB")}</span>
        </div>
      ))}
    </Panel>
  );
}
