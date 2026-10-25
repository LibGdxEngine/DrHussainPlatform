"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { stepStatus, type JourneyStep } from "../data";

interface JourneyTrackerProps {
  steps: JourneyStep[];
  /** Compact = one-line steps without the optional-visit toggle. */
  compact?: boolean;
}

/** Patient pathway across visits. The optional third visit can be marked as not needed. */
export function JourneyTracker({ steps: initial, compact }: JourneyTrackerProps) {
  const [steps, setSteps] = useState(initial);

  const toggleOptional = (id: JourneyStep["id"]) =>
    setSteps((list) =>
      list.map((s) =>
        s.id === id
          ? { ...s, status: s.status === "skipped" ? "upcoming" : "skipped", date: s.status === "skipped" ? "TBD" : "—" }
          : s,
      ),
    );

  return (
    <Panel aria-labelledby="jr" className={cn("flex flex-col gap-3", compact ? "p-4" : "p-5")}>
      <div className="flex items-center">
        <h2 id="jr" className="m-0 text-lg font-semibold">
          Visit pathway
        </h2>
        <span className="ms-auto text-xs text-muted">Follow-up is 3 months after the last visit</span>
      </div>
      <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-5">
        {steps.map((s, i) => {
          const st = stepStatus[s.status];
          const active = s.status === "current" || s.status === "waiting";
          return (
            <li
              key={s.id}
              className={cn(
                "relative flex flex-col gap-1.5 rounded-[18px] border px-3.5 py-3",
                active ? "border-brand bg-brand-wash" : "border-line",
                s.status === "skipped" && "border-dashed opacity-70",
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
              {s.optional && !compact && s.status !== "done" ? (
                <button
                  type="button"
                  onClick={() => toggleOptional(s.id)}
                  className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs font-semibold text-brand"
                >
                  {s.status === "skipped" ? "Third visit needed" : "No third visit needed"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
