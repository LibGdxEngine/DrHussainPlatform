import type { SummaryRow } from "@/lib/api/emr/intake";
import { cn } from "@/lib/utils";

/**
 * One section of her answers, as the form's `history_summary` gives them: the catalogue's label and
 * her answer in its words. Highlighted answers may set off a red or amber rule; a blank one that
 * feeds such a rule says "Not answered", highlighted, rather than reading as "no".
 */
export function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-3 gap-3">
      {rows.map((row) => (
        <div
          key={row.question}
          className={cn(
            "flex min-w-0 flex-col gap-1 rounded-[14px] p-3.5",
            row.not_answered ? "bg-warn-wash" : row.highlight ? "bg-brand-tint" : "bg-canvas-2",
          )}
        >
          <dt className={cn("text-xs", row.highlight ? "text-brand-deep" : "text-muted")}>{row.label}</dt>
          <dd className="m-0 break-words">
            {row.not_answered ? (
              <strong className="text-sm font-semibold text-warn-ink">Not answered</strong>
            ) : (
              <strong className={cn("text-sm font-semibold", row.highlight && "text-brand-ink")}>{row.value}</strong>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Whether any row of these sections needs the doctor's eye. */
export const hasFlag = (rows: SummaryRow[]) => rows.some((r) => r.highlight || r.not_answered);
