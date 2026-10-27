import { answerLimits } from "../data";
import { phoneTextareaClass } from "./controls";
import type { StepProps } from "./ReasonStep";

/** Free text for anything the questions did not cover. */
export function NotesStep({ answers, onChange }: StepProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[24px] font-bold leading-[1.4]">Anything else?</h2>
        <p className="m-0 text-[15px] leading-[1.7] text-ink-3">
          Anything you would like the doctor to know before your visit. You can leave this empty.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-[15px] font-semibold">
        In your own words
        <textarea
          rows={6}
          maxLength={answerLimits.notes}
          value={answers.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          className={phoneTextareaClass}
        />
      </label>
    </>
  );
}
