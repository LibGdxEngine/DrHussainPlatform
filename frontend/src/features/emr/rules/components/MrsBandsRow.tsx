import { cn } from "@/lib/utils";
import { mrsThresholds } from "../data";
import { cell, ThresholdInput } from "./RuleRow";

/** Static footer row: MRS score bands are labels, not alerts. */
export function MrsBandsRow() {
  return (
    <tr className="bg-canvas-2">
      <td className="ps-5 pe-2 py-2.5 font-emr-mono text-xs font-semibold">MRS</td>
      <td className="px-2 py-2.5">MRS total score (4)</td>
      <td className="px-2 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-ink-2">
          {mrsThresholds.map((t) => (
            <span key={t.aria} className="contents">
              {t.label}
              <ThresholdInput defaultValue={t.value} aria-label={t.aria} className={cn("w-12 bg-white")} />
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <span className="text-xs text-muted">Label only</span>
      </td>
      <td className="px-2 py-2.5 text-ink-2">Shown next to the score, not an alert</td>
      <td className={cn(cell, "border-b-0 pe-5")} />
    </tr>
  );
}
