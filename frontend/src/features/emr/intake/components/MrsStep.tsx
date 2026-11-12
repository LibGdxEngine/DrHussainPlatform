import { cn } from "@/lib/utils";
import { mrsItems, mrsScale, mrsScores } from "../data";
import type { MrsDraft } from "../types";

interface MrsStepProps {
  /** The catalogue's MRS question. */
  title?: string;
  scores: MrsDraft;
  onChange: (scores: MrsDraft) => void;
  /** Point out the unanswered items (after Continue or a server refusal). */
  marked?: boolean;
}

/** The 11-item Menopause Rating Scale, 0 (none) to 4 (very severe) each. */
export function MrsStep({ title, scores, onChange, marked = false }: MrsStepProps) {
  const setScore = (index: number, value: number) => onChange(scores.map((s, i) => (i === index ? value : s)));

  return (
    <>
      {title ? <h2 className="m-0 text-[20px] font-bold leading-normal">{title}</h2> : null}
      <ul className="m-0 grid list-none grid-cols-5 gap-1.5 p-0 text-center text-[11px] leading-tight text-muted" aria-label="Scale">
        {mrsScale.map((s, i) => (
          <li key={s}>
            <strong className="block text-sm text-ink">{i}</strong>
            {s}
          </li>
        ))}
      </ul>
      {mrsItems.map((label, i) => (
        <div key={label} className="flex flex-col gap-2">
          <span id={`mrs-${i}`} className={cn("text-[15px] font-semibold", marked && scores[i] === null && "text-danger-ink")}>
            {i + 1}. {label}
          </span>
          <div role="radiogroup" aria-labelledby={`mrs-${i}`} className="grid grid-cols-5 gap-1.5">
            {mrsScores.map((v) => {
              const on = scores[i] === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${v}, ${mrsScale[v]}`}
                  onClick={() => setScore(i, v)}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-[14px] text-[17px]",
                    on ? "bg-brand-ink font-bold text-white" : "border border-field bg-white text-ink",
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
