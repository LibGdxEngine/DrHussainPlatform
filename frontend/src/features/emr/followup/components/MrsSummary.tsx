import { cn } from "@/lib/utils";
import type { MrsPoint } from "@/lib/api/emr/intake";
import { formatDay } from "../../format";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { mrsBand, mrsDomainKeys, mrsDomainLabel, type MrsDomainKey } from "../../visit/answers";

interface MrsSummaryProps {
  /** Oldest first; undefined while loading. */
  points?: MrsPoint[];
  error?: string;
}

/** MRS domains from the first completed form to the latest one. */
export function MrsSummary({ points, error }: MrsSummaryProps) {
  const first = points?.[0];
  const last = points && points.length > 1 ? points[points.length - 1] : undefined;
  const rows: { key: MrsDomainKey | "total"; label: string }[] = [
    ...mrsDomainKeys.map((key) => ({ key, label: mrsDomainLabel[key] })),
    { key: "total", label: "Total" },
  ];

  return (
    <Panel aria-labelledby="ms" className="flex flex-col gap-2.5 p-5">
      <h2 id="ms" className="m-0 mb-1 text-[17px] font-semibold">
        MRS domains{first ? ` · ${formatDay(first.date)}${last ? ` → ${formatDay(last.date)}` : ""}` : ""}
      </h2>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>
      ) : !points ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !first ? (
        <p className="m-0 text-[13px] text-muted">No MRS score yet: none of her completed forms included it.</p>
      ) : (
        rows.map((r, i) => {
          const from = first[r.key];
          const fromBand = mrsBand(r.key, from);
          const to = last?.[r.key];
          const toBand = to === undefined ? undefined : mrsBand(r.key, to);
          return (
            <div
              key={r.key}
              className={cn(
                "flex items-center gap-2 py-2.5 text-[13px]",
                i < rows.length - 1 && "border-b border-line-soft",
                r.key === "total" && "font-semibold",
              )}
            >
              <span className="flex-1">{r.label}</span>
              <strong>{from}</strong>
              <Pill tone={fromBand.tone} size="xs" className="px-2 py-0.5">
                {fromBand.label}
              </Pill>
              {toBand ? (
                <>
                  <span className="text-subtle">→</span>
                  <strong>{to}</strong>
                  <Pill tone={toBand.tone} size="xs" className="px-2 py-0.5">
                    {toBand.label}
                  </Pill>
                </>
              ) : null}
            </div>
          );
        })
      )}
      {points?.length === 1 ? <p className="m-0 text-xs text-muted">One score so far; the change shows after the next form.</p> : null}
    </Panel>
  );
}
