import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { mrsRows } from "../data";

export function MrsSummary() {
  return (
    <Panel aria-labelledby="ms" className="flex flex-col gap-2.5 p-5">
      <h2 id="ms" className="m-0 mb-1 text-[17px] font-semibold">
        MRS domains · Baseline → now
      </h2>
      {mrsRows.map((r, i) => (
        <div
          key={r.label}
          className={cn(
            "flex items-center gap-2 py-2.5 text-[13px]",
            i < mrsRows.length - 1 && "border-b border-line-soft",
          )}
        >
          <span className="flex-1">{r.label}</span>
          <strong>{r.from}</strong>
          <Pill tone={r.fromTone} size="xs" className="px-2 py-0.5">
            {r.fromBand}
          </Pill>
          <span className="text-subtle">→</span>
          <strong>{r.to}</strong>
          <Pill tone={r.toTone} size="xs" className="px-2 py-0.5">
            {r.toBand}
          </Pill>
        </div>
      ))}
    </Panel>
  );
}
