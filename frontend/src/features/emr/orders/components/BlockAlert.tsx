import Link from "next/link";
import { formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { Pill } from "@/features/emr/ui/Pill";
import type { PatientAlert } from "@/lib/api/emr/alerts";

/** An open red alert on the patient's results, shown before anything is prescribed. */
export function BlockAlert({ alert, fileNumber }: { alert: PatientAlert; fileNumber: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl bg-danger-tint px-4 py-3.5">
      <Pill tone="red" size="xs" className="flex-none">Red · {alert.code}</Pill>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-relaxed">
        <strong className="text-sm font-semibold">{alert.message}</strong>
        {alert.detail ? <span className="text-ink-3">{alert.detail}</span> : null}
        {alert.value_text || alert.result_date ? (
          <span className="text-xs text-muted">
            {[alert.value_text, alert.result_date ? `result ${formatDay(alert.result_date)}` : ""].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      <Link
        href={`${emrRoutes.visit}?patient=${encodeURIComponent(fileNumber)}`}
        className="ms-auto inline-flex min-h-[34px] flex-none items-center rounded-full border border-ink bg-white px-3 text-xs font-semibold text-ink no-underline"
      >
        Go to alert
      </Link>
    </div>
  );
}
