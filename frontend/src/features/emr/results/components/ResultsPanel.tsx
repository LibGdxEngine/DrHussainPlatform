"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDay } from "@/features/emr/format";
import { KeyValueHeader, KeyValueRow } from "@/features/emr/documents/components/KeyValueRow";
import type { KeyValueDef } from "@/features/emr/documents/data";
import { ActionButton } from "@/features/emr/ui/Action";
import { Field, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { cn } from "@/lib/utils";
import type { PatientDocument } from "@/lib/api/emr/documents";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { resultsApi, type InvestigationReport, type LabTest, type ResultValue } from "@/lib/api/emr/results";
import { flagReason, reportTypeLabel, statusLabel } from "../labels";
import { AlertsList } from "./AlertsList";
import { ResultValuesTable } from "./ResultValuesTable";

/** Lab results and pathology are read automatically; other files only take typed values. */
const READ_SLOTS = new Set(["lab", "path"]);
const POLL_MS = 3000;
const MAX_POLLS = 20;
const NEVER_QUEUED_AFTER = 3;

type Loaded = { report: InvestigationReport | null; error?: string };

function toDef(test: LabTest): KeyValueDef {
  const bound = (value?: string | null) => (value == null ? null : Number(value));
  return {
    id: test.code,
    name: test.name,
    unit: test.default_unit ?? "",
    lo: bound(test.optimal_low),
    hi: bound(test.optimal_high),
    optimal: test.optimal_text ?? "",
  };
}


/** Results read from one document, plus typed key values. Remount per document (key on its id). */
export function ResultsPanel({ document }: { document: PatientDocument }) {
  const readable = READ_SLOTS.has(document.slot);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [polls, setPolls] = useState(0);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sampleDate, setSampleDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    resultsApi.forDocument(document.id).then(
      (report) => !cancelled && setLoaded({ report }),
      (err: unknown) => !cancelled && setLoaded({ report: null, error: apiErrorMessage(err, "Could not load results.") }),
    );
    return () => {
      cancelled = true;
    };
  }, [document.id, polls]);

  useEffect(() => {
    let cancelled = false;
    resultsApi.tests(true).then((list) => !cancelled && setTests(list), () => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const report = loaded?.report ?? null;
  // A lab file is queued for reading on upload, so no report yet means "not read yet".
  const reading = readable && loaded !== null && !loaded.error && (!report || report.status === "pending");
  useEffect(() => {
    if (!reading || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => setPolls((n) => n + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [reading, polls]);

  const manual = useMemo(() => {
    const values: Record<string, string> = {};
    for (const v of report?.values ?? []) if (v.source === "manual" && v.test) values[v.test.code] = v.value_text ?? "";
    return values;
  }, [report]);
  const extracted = (report?.values ?? []).filter((v) => v.source !== "manual");
  const dateValue = sampleDate ?? report?.collected_on ?? document.document_date ?? "";

  async function act(run: () => Promise<InvestigationReport>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await run();
      setLoaded({ report: next });
      setNotice({ tone: "ok", text: done });
      if (next.status === "pending") setPolls(0);
      return true;
    } catch (err) {
      const forbidden = err instanceof ApiError && err.status === 403;
      setNotice({ tone: "error", text: forbidden ? "Only the doctor can do this." : apiErrorMessage(err, "Could not save.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function readNow() {
    setBusy(true);
    try {
      await resultsApi.read(document.id);
      setPolls(0);
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorMessage(err, "Could not queue the file.") });
    } finally {
      setBusy(false);
    }
  }

  async function saveTyped() {
    const saved = await act(() => resultsApi.saveManualValues({
      document: document.id,
      result_date: dateValue || null,
      values: tests.map((t) => ({ test: t.code, value: typed[t.code] ?? manual[t.code] ?? "" })),
    }), "Values saved to the patient's results.");
    if (saved) {
      setTyped({});
      setSampleDate(null);
    }
  }

  return (
    <Panel aria-labelledby="kvs" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="kvs" className="m-0 text-lg font-semibold">Results from this file</h2>
        {report ? (
          <Pill tone={report.status === "flagged" ? "red" : report.status === "pending" ? "neutral" : "ok"} size="xs">
            {statusLabel[report.status]}
          </Pill>
        ) : null}
      </div>

      <AlertsList patient={document.patient} />

      {loaded?.error ? <p role="alert" className="m-0 text-sm text-danger-ink">{loaded.error}</p> : null}
      {!loaded ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
      {reading ? (
        <div role="status" className="flex flex-col items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[13px] text-muted">
          {polls >= MAX_POLLS
            ? "Still reading. Reopen this file in a moment."
            : "Reading the report on the clinic's server…"}
          {!report && polls >= NEVER_QUEUED_AFTER ? (
            // Files uploaded before reading existed were never queued.
            <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => void readNow()}>
              Read this file now
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {report && report.status !== "pending" && report.method !== "manual" ? (
        <ReadSummary
          report={report}
          values={extracted}
          busy={busy}
          onReread={() => act(() => resultsApi.reread(report.id), "Reading the file again…")}
          onConfirm={() => act(() => resultsApi.confirm(report.id), "Confirmed as this patient's report.")}
        />
      ) : null}
      {!readable && !report ? (
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Only lab results and pathology reports are read automatically. Type the key values below if this file has any.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="m-0 text-base font-semibold">Key values typed from this file</h3>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Values outside the clinic&apos;s optimal target are shaded, not flagged as alerts.
        </p>
        <KeyValueHeader />
        {tests.map((test) => (
          <KeyValueRow
            key={test.code}
            def={toDef(test)}
            value={typed[test.code] ?? manual[test.code] ?? ""}
            onChange={(v) => setTyped((prev) => ({ ...prev, [test.code]: v }))}
          />
        ))}
        <Field label="Sample date">
          <TextInput type="date" value={dateValue} onChange={(e) => setSampleDate(e.target.value)} />
        </Field>
        <ActionButton
          className="self-start px-[22px]"
          disabled={busy || (!Object.keys(typed).length && sampleDate === null)}
          onClick={() => void saveTyped()}
        >
          {busy ? "Saving…" : "Save values"}
        </ActionButton>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn("m-0 rounded-xl px-3 py-2.5 text-[13px]", notice.tone === "error" ? "bg-danger-tint text-danger-ink" : "bg-ok-tint text-ok-ink")}
        >
          {notice.text}
        </p>
      ) : null}
    </Panel>
  );
}

interface ReadSummaryProps {
  report: InvestigationReport;
  values: ResultValue[];
  busy: boolean;
  onReread: () => void;
  onConfirm: () => void;
}

/** What the platform read: report type, flags for the doctor, and each value beside the previous one. */
function ReadSummary({ report, values, busy, onReread, onConfirm }: ReadSummaryProps) {
  const patientDoubt = report.flag_reasons.some((r) => r.startsWith("patient_"));
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-ink-2">
        {reportTypeLabel[report.report_type]}
        {report.lab_name ? ` · ${report.lab_name}` : ""}
        {report.collected_on ? ` · sample ${formatDay(report.collected_on)}` : ""}
        {report.method === "ocr" ? " · read from a scan" : ""}
      </p>
      {report.flag_reasons.length ? (
        <div role="alert" className="flex flex-col gap-1.5 rounded-xl bg-warn-wash px-3 py-2.5 text-[13px] text-warn-ink">
          <strong className="font-semibold">Needs the doctor</strong>
          <ul className="m-0 ps-4">
            {report.flag_reasons.map((reason) => (
              <li key={reason}>{flagReason(reason)}</li>
            ))}
          </ul>
          {patientDoubt ? (
            <span>Until the doctor confirms it, these values are not used as earlier results.</span>
          ) : null}
        </div>
      ) : null}

      {values.length ? <ResultValuesTable values={values} /> : null}

      <div className="flex flex-wrap gap-2">
        <ActionButton variant="quiet" size="sm" disabled={busy} onClick={onReread}>
          Read again
        </ActionButton>
        {report.status === "flagged" && patientDoubt ? (
          <ActionButton size="sm" disabled={busy} onClick={onConfirm}>
            Doctor: confirm it is this patient
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
