import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { patientReplies, reminders } from "../data";

export function PatientRepliesPanel() {
  return (
    <Panel variant="outline" aria-labelledby="rp" className="flex flex-col px-5 py-[18px]">
      <h2 id="rp" className="m-0 mb-2 text-lg font-semibold">
        ردود المرضى
      </h2>
      {patientReplies.map((r, i) => (
        <Link
          key={r.title}
          href={emrRoutes.visit}
          className={cn(
            "flex gap-3 py-3 text-ink no-underline",
            i < patientReplies.length - 1 && "border-b border-line-soft",
          )}
        >
          <span
            className={cn(
              "flex size-[38px] flex-none items-center justify-center rounded-full text-sm font-semibold",
              r.tone === "brand" ? "bg-brand-tint text-brand-deep" : "bg-warn-tint text-warn-ink",
            )}
          >
            {r.initial}
          </span>
          <span className="flex flex-col gap-[3px]">
            <strong className="text-sm font-semibold">{r.title}</strong>
            <span className="text-[13px] leading-relaxed text-muted">{r.excerpt}</span>
          </span>
        </Link>
      ))}
    </Panel>
  );
}

export function RemindersPanel() {
  return (
    <Panel variant="outline" aria-labelledby="rm" className="flex flex-col gap-3 px-5 py-[18px]">
      <h2 id="rm" className="m-0 text-lg font-semibold">
        تذكيرات
      </h2>
      {reminders.map((r) => (
        <div key={r.code} className="flex items-center gap-2.5 text-[13px]">
          <span className="rounded-full bg-line-soft px-2 py-[3px] font-emr-mono text-[11px] font-medium text-ink-3">
            {r.code}
          </span>
          {r.text}
        </div>
      ))}
    </Panel>
  );
}
