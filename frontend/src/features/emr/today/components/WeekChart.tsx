import { cn } from "@/lib/utils";
import { weekdayShort } from "@/features/emr/appointments/schedule";
import { Panel, PanelHeading } from "@/features/emr/ui/Panel";
import type { WeekBar } from "../summary";

const MAX_BAR_PX = 150;
const MIN_BAR_PX = 6;

const barStyles: Record<WeekBar["kind"], string> = {
  past: "bg-brand-mid",
  today: "bg-brand-ink",
  future:
    "border border-hatch bg-[repeating-linear-gradient(45deg,var(--color-hatch)_0_3px,#fff_3px_7px)]",
};

interface WeekChartProps {
  /** undefined while loading. */
  days?: WeekBar[];
  error?: string;
}

/** Visits booked on each day of this clinic week. */
export function WeekChart({ days, error }: WeekChartProps) {
  const max = Math.max(1, ...(days ?? []).map((d) => d.count));
  const total = (days ?? []).reduce((sum, d) => sum + d.count, 0);
  return (
    <Panel variant="outline" aria-labelledby="wk" className="flex flex-col gap-3.5 p-5">
      <PanelHeading id="wk" aside={days ? `${total} ${total === 1 ? "visit" : "visits"}` : undefined}>
        This week&apos;s visits
      </PanelHeading>
      {error ? <p role="alert" className="m-0 text-sm text-danger-ink">{error}</p> : null}
      {!days && !error ? <p className="m-0 text-sm text-muted">Loading…</p> : null}
      {days ? (
        <div className="flex min-h-[190px] flex-1 items-end justify-between gap-2.5">
          {days.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  d.kind === "today" ? "bg-brand-tint text-ok-ink" : "text-muted",
                )}
              >
                {d.count}
              </span>
              <div
                className={cn("w-full max-w-[46px] rounded-full", barStyles[d.kind])}
                style={{ height: Math.max(MIN_BAR_PX, Math.round((d.count / max) * MAX_BAR_PX)) }}
              />
              <span className="text-[13px] text-muted">{weekdayShort(d.day)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
