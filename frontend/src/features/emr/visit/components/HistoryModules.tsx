import { cn } from "@/lib/utils";
import { periodLabel, yesNoLabel, type FormAnswers } from "../answers";

export interface LabeledValue {
  label: string;
  value?: string;
  highlight?: boolean;
}

/** Grid of answer tiles; a missing answer says so rather than showing a guess. */
export function AnswerGrid({ items, columns = 3 }: { items: LabeledValue[]; columns?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((d) => (
        <div
          key={d.label}
          className={cn("flex flex-col gap-1 rounded-[14px] p-3.5", d.highlight ? "bg-brand-tint" : "bg-canvas-2")}
        >
          <span className={cn("text-xs", d.highlight ? "text-brand-deep" : "text-muted")}>{d.label}</span>
          {d.value ? (
            <strong className={cn("text-sm font-semibold", d.highlight && "text-brand-ink")}>{d.value}</strong>
          ) : (
            <span className="text-sm text-subtle">Not answered</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Says plainly that a module's questions are not recorded anywhere yet. */
export function NotRecorded({ title, items, note }: { title: string; items?: string[]; note?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-canvas-2 p-4 text-[13px] leading-relaxed">
      <strong className="font-semibold">{title}: not recorded</strong>
      {items?.length ? <span className="text-muted">{items.join(" · ")}</span> : null}
      {note ? <span className="text-ink-2">{note}</span> : null}
      <span className="text-muted">The patient form does not ask these questions yet; take them in clinic.</span>
    </div>
  );
}

export function PeriodsModule({ answers }: { answers: FormAnswers }) {
  return (
    <AnswerGrid
      items={[
        { label: "Last period", value: answers.last_period },
        { label: "Periods now", value: periodLabel(answers.period_status) },
        { label: "Age periods stopped", value: answers.menopause_age?.toString() },
        {
          label: "Bleeding 12+ months after the last period",
          value: yesNoLabel(answers.bleed_after_year),
          highlight: answers.bleed_after_year === "yes",
        },
        {
          label: "Bleeding between periods",
          value: yesNoLabel(answers.intermenstrual),
          highlight: answers.intermenstrual === "yes",
        },
        { label: "Uterus", value: answers.uterus === "yes" ? "Present" : answers.uterus === "no" ? "Removed" : undefined },
        { label: "Could be pregnant", value: yesNoLabel(answers.pregnant), highlight: answers.pregnant === "yes" },
      ]}
    />
  );
}

export function DischargeModule({ answers }: { answers: FormAnswers }) {
  return (
    <NotRecorded
      title="Discharge & infections"
      items={["Discharge", "Itching", "Burning on urination", "Pelvic pain or fever", "Partners"]}
      note={answers.reasons.includes("dis") ? "She ticked “Discharge or infection” as a reason for this visit." : undefined}
    />
  );
}

export function CoreHistoryModule() {
  return (
    <NotRecorded
      title="Core history"
      items={["Obstetric", "Medications", "Family history", "Lifestyle", "Screening", "Allergies"]}
    />
  );
}
