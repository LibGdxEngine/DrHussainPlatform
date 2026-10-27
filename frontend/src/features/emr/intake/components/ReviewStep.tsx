import type { ReviewRow, StepId } from "../types";

interface ReviewStepProps {
  rows: ReviewRow[];
  onEdit: (step: StepId) => void;
}

/** Check-and-send: every answer in plain words, each with a way back to change it. */
export function ReviewStep({ rows, onEdit }: ReviewStepProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[24px] font-bold leading-[1.4]">Check your answers</h2>
        <p className="m-0 text-[15px] leading-[1.7] text-ink-3">
          Once you send the form you cannot change it. If something changes later, tell the clinic at your visit.
        </p>
      </div>
      <dl className="m-0 flex flex-col rounded-[18px] border border-line bg-white">
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-start gap-3 border-b border-line-soft px-4 py-3 last:border-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <dt className="text-[13px] text-muted">{r.label}</dt>
              <dd className="m-0 whitespace-pre-line break-words text-[15px]">{r.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              className="cursor-pointer text-[13px] font-semibold text-brand"
              aria-label={`Change: ${r.label}`}
            >
              Change
            </button>
          </div>
        ))}
      </dl>
    </>
  );
}
