import { cn } from "@/lib/utils";
import { Panel, PanelHeading } from "@/features/emr/ui/Panel";
import type { WeekDay } from "../data";

const MAX_BAR_PX = 150;

const barStyles: Record<WeekDay["kind"], string> = {
  past: "bg-brand-mid",
  today: "bg-brand-ink",
  future:
    "border border-hatch bg-[repeating-linear-gradient(45deg,var(--color-hatch)_0_3px,#fff_3px_7px)]",
};

export function WeekChart({ days, total }: { days: WeekDay[]; total: number }) {
  const max = Math.max(...days.map((d) => d.count));
  return (
    <Panel variant="outline" aria-labelledby="wk" className="flex flex-col gap-3.5 p-5">
      <PanelHeading id="wk" aside={`${total} زيارة`}>
        زيارات الأسبوع
      </PanelHeading>
      <div className="flex min-h-[190px] flex-1 items-end justify-between gap-2.5">
        {days.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            {d.kind === "today" ? (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-ok-ink">
                {d.count}
              </span>
            ) : null}
            <div
              className={cn("w-full max-w-[46px] rounded-full", barStyles[d.kind])}
              style={{ height: Math.round((d.count / max) * MAX_BAR_PX) }}
            />
            <span className="text-[13px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
