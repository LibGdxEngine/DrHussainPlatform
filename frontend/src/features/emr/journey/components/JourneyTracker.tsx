import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { stepStatus, type JourneyStep } from "../data";
import { FOLLOW_UP_MONTHS } from "../logic";

interface JourneyTrackerProps {
  /** Undefined while the visits load. */
  steps?: JourneyStep[];
  error?: string;
  /** Compact = one-line steps without the detail text. */
  compact?: boolean;
}

/** Patient pathway: first contact, each booked visit and the follow-up, from the clinic schedule. */
export function JourneyTracker({ steps, error, compact }: JourneyTrackerProps) {
  return (
    <Panel aria-labelledby="jr" className={cn("flex flex-col gap-3", compact ? "p-4" : "p-5")}>
      <div className="flex items-center">
        <h2 id="jr" className="m-0 text-lg font-semibold">
          Visit pathway
        </h2>
        <span className="ms-auto text-xs text-muted">
          Follow-up is {FOLLOW_UP_MONTHS} months after the last visit
        </span>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>
      ) : !steps ? (
        <p className="m-0 text-[13px] text-muted">Loading visits…</p>
      ) : (
        <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {steps.map((s, i) => {
            const st = stepStatus[s.status];
            return (
              <li
                key={s.id}
                className={cn(
                  "relative flex flex-col gap-1.5 rounded-[18px] border px-3.5 py-3",
                  s.status === "current" ? "border-brand bg-brand-wash" : "border-line",
                  s.status === "planned" && "border-dashed",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold",
                      s.status === "done" ? "bg-brand text-white" : "bg-line-soft text-ink-3",
                    )}
                  >
                    {s.status === "done" ? "✓" : i + 1}
                  </span>
                  <strong className="text-sm font-semibold">{s.title}</strong>
                </span>
                <Pill tone={st.tone} size="xs" className="self-start">
                  {st.label}
                </Pill>
                {!compact ? <span className="text-xs leading-relaxed text-muted">{s.detail}</span> : null}
                <span className="text-xs font-medium text-ink-2">{s.date}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
