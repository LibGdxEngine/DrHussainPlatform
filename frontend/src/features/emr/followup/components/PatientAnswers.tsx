import { cn } from "@/lib/utils";
import { formatDay } from "../../format";
import { Panel } from "../../ui/Panel";
import {
  adherenceLabel,
  formStatusText,
  lowerFirst,
  overallLabel,
  readAnswers,
  sideEffectLabel,
  yesNoLabel,
} from "../../visit/answers";
import type { LatestForm } from "../../visit/forms";

interface Answer {
  label: string;
  value?: string;
  wide?: boolean;
  emphasis?: "good" | "warn";
  quote?: boolean;
}

/** Her answers on the latest completed follow-up form. */
export function PatientAnswers({ form, error }: { form?: LatestForm; error?: string }) {
  const answered = form?.answered;
  const a = readAnswers(answered?.answers);
  const answers: Answer[] = [
    {
      label: "Overall since last visit",
      value: overallLabel(a.overall),
      emphasis: a.overall === "much" || a.overall === "better" ? "good" : a.overall === "worse" ? "warn" : undefined,
    },
    { label: "Taking treatment as prescribed", value: adherenceLabel(a.adherence), emphasis: a.adherence && a.adherence !== "yes" ? "warn" : undefined },
    ...(a.adherence_reason
      ? [{ label: "Why", value: `“${a.adherence_reason}”`, wide: true, emphasis: "warn" as const, quote: true }]
      : []),
    { label: "Side effects", value: a.side_effects.length ? a.side_effects.map(sideEffectLabel).join(", ") : answered ? "None ticked" : undefined },
    { label: "Bleeding or spotting", value: yesNoLabel(a.bleeding), emphasis: a.bleeding === "yes" ? "warn" : undefined },
    {
      label: "Medicines she confirmed",
      value: a.medicines.length
        ? a.medicines.map((m) => `${m.name}${m.still_taking ? "" : " (stopped)"}`).join(" · ")
        : undefined,
      wide: true,
      emphasis: a.medicines.some((m) => !m.still_taking) ? "warn" : undefined,
    },
    ...(a.notes ? [{ label: "In her words", value: `“${a.notes}”`, wide: true, quote: true }] : []),
  ];

  return (
    <Panel aria-labelledby="fa" className="flex flex-col gap-2.5 p-5">
      <h2 id="fa" className="m-0 mb-1 text-[17px] font-semibold">
        Her follow-up answers
      </h2>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>
      ) : !form ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !answered ? (
        <p className="m-0 text-[13px] text-muted">
          No completed follow-up form. Latest follow-up form: {lowerFirst(formStatusText(form.latest))}.
        </p>
      ) : (
        <>
          <span className="text-xs text-muted">Submitted {formatDay(answered.submitted_at)}</span>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            {answers.map((ans) => (
              <div
                key={ans.label}
                className={cn(
                  "rounded-xl p-2.5",
                  ans.emphasis === "warn" ? "bg-warn-wash" : "bg-canvas-2",
                  ans.wide && "col-span-full",
                )}
              >
                <span className="text-[11px] text-muted">{ans.label}</span>
                <br />
                {ans.value ? (
                  <strong
                    className={cn(ans.quote ? "font-medium" : "font-semibold", ans.emphasis === "good" && "text-ok-ink")}
                  >
                    {ans.value}
                  </strong>
                ) : (
                  <span className="text-subtle">Not answered</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
