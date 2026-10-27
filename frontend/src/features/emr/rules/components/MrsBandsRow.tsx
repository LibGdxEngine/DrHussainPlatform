import { cn } from "@/lib/utils";
import { cell, ThresholdInput } from "./RuleRow";

interface MrsBandsRowProps {
  /** Band labels with the typed starting score (text while editing). */
  bands: { label: string; min: string }[];
  version?: number;
  edited: boolean;
  onChange: (index: number, min: string) => void;
}

/** Footer row: MRS score bands are labels shown next to the score, not alerts. */
export function MrsBandsRow({ bands, version, edited, onChange }: MrsBandsRowProps) {
  return (
    <tr className={edited ? "bg-warn-wash" : "bg-canvas-2"}>
      <td className="ps-5 pe-2 py-2.5 font-emr-mono text-xs font-semibold">
        MRS
        {version ? <span className="block text-[11px] font-normal text-subtle">v{version}</span> : null}
      </td>
      <td className="px-2 py-2.5">MRS total score (4)</td>
      <td className="px-2 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-ink-2">
          {bands.map((band, index) => (
            <span key={band.label} className="contents">
              {band.label} ≥
              <ThresholdInput
                inputMode="numeric"
                value={band.min}
                onChange={(e) => onChange(index, e.target.value)}
                aria-label={`${band.label} band starts at`}
                className={cn("w-12 bg-white")}
              />
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
