"use client";

import { cn } from "@/lib/utils";
import type { Examination } from "@/lib/api/emr/examinations";
import { AlertsList } from "../../results/components/AlertsList";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { planOptions, screeningItems } from "../data";
import type { VitalsResult } from "../vitals";
import type { PanelProps } from "./ExamMain";

const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const stamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const planLabel = (plan?: string) => planOptions.find((o) => o.id === plan)?.label;

function ScreeningPanel({ form, onChange }: PanelProps) {
  return (
    <Panel aria-labelledby="sc" className="flex flex-col gap-1 p-5">
      <h2 id="sc" className="m-0 mb-2 text-lg font-semibold">Screening checklist</h2>
      {screeningItems.map((item, i) => (
        <label key={item.key}
          className={cn("flex items-center gap-3 py-2.5 text-sm", i < screeningItems.length - 1 && "border-b border-line-soft")}>
          <input type="checkbox" className="size-[18px] accent-brand" checked={form.screening[item.key] ?? false}
            onChange={(e) => onChange({ screening: { ...form.screening, [item.key]: e.target.checked } })} />
          {item.label}
        </label>
      ))}
    </Panel>
  );
}

function AutoCalcPanel({ vitals }: { vitals: VitalsResult }) {
  return (
    <Panel aria-labelledby="ac" className="flex flex-col gap-3 bg-[linear-gradient(160deg,#e4f2e9_0%,#cde6d7_100%)] p-5">
      <h2 id="ac" className="m-0 text-lg font-semibold">Auto-calculated</h2>
      {[["Average blood pressure", vitals.bpAvg], ["BMI", vitals.bmi]].map(([label, value]) => (
        <div key={label} className="flex items-center rounded-[14px] bg-white px-3.5 py-3 text-sm">
          <span>{label}</span>
          <strong className="ms-auto text-[17px] font-bold">{value}</strong>
        </div>
      ))}
    </Panel>
  );
}

function PastExaminations({ exams, selected, busy, onOpen }: {
  exams: Examination[] | null; selected?: string; busy: boolean; onOpen: (exam: Examination) => void;
}) {
  return (
    <Panel aria-label="Past examinations" className="flex flex-col gap-3 p-5">
      <h2 className="m-0 text-lg font-semibold">Examinations</h2>
      {exams === null ? <p className="m-0 text-sm text-muted">Loading examinations…</p> : null}
      {exams?.length === 0 ? <p className="m-0 text-sm text-muted">No examinations recorded yet.</p> : null}
      {exams?.map((exam) => (
        <article key={exam.id} className={cn("rounded-2xl border p-3.5 text-sm", exam.id === selected ? "border-brand bg-brand-wash" : "border-line")}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{exam.examined_on ? day(exam.examined_on) : "Undated"}</h3>
            {planLabel(exam.plan) ? <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-ink">{planLabel(exam.plan)}</span> : null}
            <ActionButton variant="quiet" size="sm" className="ms-auto" disabled={busy || exam.id === selected}
              onClick={() => onOpen(exam)}>{exam.id === selected ? "Open" : "Edit"}</ActionButton>
          </div>
          <p className="mb-0 mt-1.5 text-xs text-muted">
            {[exam.bp_average && `BP ${exam.bp_average.systolic}/${exam.bp_average.diastolic}`,
              exam.bmi && `BMI ${exam.bmi}`, exam.waist_cm && `Waist ${Number(exam.waist_cm)} cm`]
              .filter(Boolean).join(" · ") || "No vitals recorded"}
          </p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold">History ({exam.revisions.length})</summary>
            <ol className="mt-2 flex list-none flex-col gap-1.5 p-0">
              {exam.revisions.map((revision) => (
                <li key={revision.number} className="text-muted">
                  Version {revision.number} · {stamp(revision.created_at)} · {revision.author_name || "Unknown author"}
                </li>
              ))}
            </ol>
          </details>
        </article>
      ))}
    </Panel>
  );
}

interface ExamAsideProps extends PanelProps {
  vitals: VitalsResult;
  patientId: string;
  alertsKey: number;
  exams: Examination[] | null;
  editing?: Examination;
  busy: boolean;
  canSave: boolean;
  error: string | null;
  notice: string | null;
  conflict: boolean;
  onSave: () => void;
  onNew: () => void;
  onOpen: (exam: Examination) => void;
  onReload: () => void;
}

/** Right column of the exam screen: checklist, calculated values, alerts, saving and earlier examinations. */
export function ExamAside(props: ExamAsideProps) {
  const { form, onChange, vitals, patientId, alertsKey, exams, editing, busy, canSave, error, notice, conflict } = props;
  return (
    <div className="flex flex-col gap-4">
      <ScreeningPanel form={form} onChange={onChange} />
      <AutoCalcPanel vitals={vitals} />
      <AlertsList patient={patientId} refreshKey={alertsKey} title="Open alerts for this patient" />
      <div className="flex flex-col gap-2">
        {error ? <p role="alert" className="m-0 text-sm text-danger-ink">{error}</p> : null}
        {notice ? <p role="status" className="m-0 text-sm text-ok-ink">{notice}</p> : null}
        <div className="flex gap-2.5">
          <ActionButton size="lg" className="min-h-[50px] flex-1 text-sm" disabled={busy || !canSave || conflict}
            onClick={props.onSave}>
            {busy ? "Saving…" : editing ? "Save changes" : "Save examination"}
          </ActionButton>
          {editing ? (
            <ActionButton variant="outline" size="lg" className="min-h-[50px] bg-white px-6 text-sm" disabled={busy}
              onClick={props.onNew}>New examination</ActionButton>
          ) : null}
        </div>
        {conflict ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Reloading discards this draft. Copy your changes first if needed.
            <ActionButton variant="quiet" size="sm" disabled={busy} onClick={props.onReload}>Reload examinations</ActionButton>
          </div>
        ) : null}
      </div>
      <PastExaminations exams={exams} selected={editing?.id} busy={busy} onOpen={props.onOpen} />
    </div>
  );
}
