import { cn } from "@/lib/utils";
import type { ResultValue } from "@/lib/api/emr/results";
import { formatDay } from "../../format";
import { Pill } from "../../ui/Pill";
import { changeLabel } from "../labels";

function rangeText(value: ResultValue) {
  if (value.ref_text) return value.ref_text;
  if (value.ref_low != null && value.ref_high != null) return `${value.ref_low}–${value.ref_high}`;
  return "—";
}

const flagPill: Record<string, { tone: "red" | "amber" | "ok"; text: string }> = {
  H: { tone: "amber", text: "High" },
  L: { tone: "amber", text: "Low" },
  A: { tone: "red", text: "Abnormal" },
  N: { tone: "ok", text: "Normal" },
};

/** Each value read from a report, flagged when abnormal, beside the previous result and its date. */
export function ResultValuesTable({ values }: { values: ResultValue[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-start text-xs text-muted">
            <th className="py-1.5 pe-2 text-start font-medium">Test</th>
            <th className="py-1.5 pe-2 text-start font-medium">Result</th>
            <th className="py-1.5 pe-2 text-start font-medium">Range</th>
            <th className="py-1.5 text-start font-medium">Previous</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v) => {
            const flag = v.flag ? flagPill[v.flag] : null;
            const previous = v.comparison.previous;
            return (
              <tr key={v.id} className="border-t border-line-soft align-top">
                <td className="py-2 pe-2 font-semibold">
                  {v.test?.name ?? v.raw_name}
                  {!v.test ? <span className="block text-[11px] font-normal text-subtle">Not in the catalog</span> : null}
                </td>
                <td className="py-2 pe-2">
                  {v.unreadable ? (
                    <Pill tone="red" size="xs">Unreadable</Pill>
                  ) : (
                    <span className={cn(v.abnormal && "font-semibold text-danger-ink")}>
                      {v.value_text} {v.unit}
                    </span>
                  )}
                  {flag && flag.text !== "Normal" ? (
                    <Pill tone={flag.tone} size="xs" className="ms-1.5">{flag.text}</Pill>
                  ) : null}
                </td>
                <td className="py-2 pe-2 text-ink-3">{rangeText(v)}</td>
                <td className="py-2 text-ink-3">
                  {previous ? (
                    <>
                      {previous.value_text} {previous.unit} · {formatDay(previous.result_date)}
                      <span
                        className={cn(
                          "block text-[11px]",
                          v.comparison.change === "not_comparable" ? "font-semibold text-warn-ink" : "text-subtle",
                        )}
                      >
                        {changeLabel(v.comparison)}
                      </span>
                    </>
                  ) : (
                    <span className="text-subtle">{changeLabel(v.comparison)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
