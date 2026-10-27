import type { MrsPoint } from "@/lib/api/emr/intake";
import { cn } from "@/lib/utils";
import { overallOptions } from "../data";
import { progressBars, progressMessage } from "../logic";
import { ChoiceGroup, Question } from "./controls";
import type { StepProps } from "./ReasonStep";

/** Earlier symptom (MRS) scores from this patient's previous forms. */
function ProgressChart({ points }: { points: MrsPoint[] }) {
  const bars = progressBars(points);
  const message = progressMessage(points);
  if (!bars.length) {
    return (
      <p className="m-0 rounded-[22px] bg-linear-to-br from-mint-1 to-mint-2 p-[18px] text-[15px] leading-[1.7]">
        This is your first symptom check with us. Your answers today become the starting point for tracking your progress.
      </p>
    );
  }
  return (
    <figure className="m-0 flex flex-col gap-3 rounded-[22px] bg-linear-to-br from-mint-1 to-mint-2 p-[18px]">
      <figcaption className="text-sm font-semibold">Your symptom scores from earlier forms (out of 44)</figcaption>
      <div className="flex h-[120px] items-end gap-3.5" aria-hidden>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <strong className="text-sm">{b.value}</strong>
            <div
              className={cn("w-11 rounded-full", i === bars.length - 1 ? "bg-brand-ink" : "bg-brand-mid")}
              style={{ height: `${b.pct}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3.5 text-center text-xs text-ink-2" aria-hidden>
        {bars.map((b, i) => (
          <span key={`${b.label}-${i}`} className="flex-1">{b.label}</span>
        ))}
      </div>
      <ul className="sr-only">
        {bars.map((b, i) => (
          <li key={`${b.label}-${i}`}>{b.label}: {b.value}</li>
        ))}
      </ul>
      {message ? <span className="text-[13px] text-brand-deep">{message}</span> : null}
    </figure>
  );
}

/** Follow-up opening: earlier scores, then how the patient feels now. */
export function ProgressStep({ answers, onChange, previous }: StepProps & { previous: MrsPoint[] }) {
  return (
    <>
      <ProgressChart points={previous} />
      <Question label="Since your last visit, how are you feeling?" className="gap-2.5 [&>span]:text-base">
        <ChoiceGroup
          label="Since your last visit, how are you feeling"
          columns={2}
          size="lg"
          options={overallOptions}
          value={answers.overall}
          onChange={(v) => onChange({ overall: v })}
        />
      </Question>
    </>
  );
}
