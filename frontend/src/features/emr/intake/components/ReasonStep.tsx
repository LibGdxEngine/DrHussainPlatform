import { answerLimits, menopauseModule, visitReasons } from "../data";
import { needsMrs, toggleIn } from "../logic";
import type { Answers } from "../types";
import { ToggleChip, phoneTextareaClass } from "./controls";

export interface StepProps {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
}

/** Reason picker; menopause reasons add the symptom questions to the form. */
export function ReasonStep({ answers, onChange }: StepProps) {
  const reasons = answers.reasons ?? [];
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[24px] font-bold leading-[1.4]">What brings you in?</h2>
        <p className="m-0 text-[15px] leading-[1.7] text-ink-3">
          Choose all that apply. We will only ask the questions that matter to you.
        </p>
      </div>
      <div role="group" aria-label="Reasons for your visit" className="flex flex-wrap gap-2">
        {visitReasons.map((r) => (
          <ToggleChip
            key={r.id}
            selected={reasons.includes(r.id)}
            onClick={() => onChange({ reasons: toggleIn(reasons, r.id) })}
          >
            {r.label}
          </ToggleChip>
        ))}
      </div>
      {reasons.includes("other") ? (
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          What else would you like to see the doctor about?
          <textarea
            rows={3}
            maxLength={answerLimits.otherReason}
            value={answers.other_reason ?? ""}
            onChange={(e) => onChange({ other_reason: e.target.value })}
            className={phoneTextareaClass}
          />
        </label>
      ) : null}
      {needsMrs(reasons) ? (
        <p className="m-0 flex rounded-[18px] border border-line bg-white px-4 py-3.5 text-[15px]">
          <span>Added to your form: {menopauseModule.name}</span>
          <span className="ms-auto ps-3 text-[13px] text-muted">{menopauseModule.minutes}</span>
        </p>
      ) : null}
    </>
  );
}
