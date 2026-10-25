import { cn } from "@/lib/utils";
import { coreHistory, discharge } from "../data";

export function DischargeModule() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {discharge.map((d) => (
        <div
          key={d.label}
          className={cn(
            "flex flex-col gap-1 rounded-[14px] p-3.5",
            d.highlight ? "bg-brand-tint" : "bg-canvas-2",
          )}
        >
          <span className={cn("text-xs", d.highlight ? "text-brand-deep" : "text-muted")}>{d.label}</span>
          <strong className={cn("text-sm font-semibold", d.highlight && "text-brand-ink")}>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function CoreHistoryModule() {
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px] leading-[1.7]">
      {coreHistory.map((c) => (
        <div key={c.title} className="rounded-[14px] bg-canvas-2 p-3.5">
          <strong className="font-semibold">{c.title}</strong>
          <br />
          {c.body}
        </div>
      ))}
    </div>
  );
}
