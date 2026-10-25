import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { filesAwaitingScan, patientReplies, reminders, upcomingFollowups } from "../data";

export function PatientRepliesPanel() {
  return (
    <Panel variant="outline" aria-labelledby="rp" className="flex flex-col px-5 py-[18px]">
      <h2 id="rp" className="m-0 mb-2 text-lg font-semibold">
        Patient replies
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
        Reminders
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

export function FollowupsPanel() {
  return (
    <Panel variant="outline" aria-labelledby="fu" className="flex flex-col px-5 py-[18px]">
      <div className="mb-1 flex items-center">
        <h2 id="fu" className="m-0 text-lg font-semibold">
          Upcoming 3-month follow-ups
        </h2>
      </div>
      {upcomingFollowups.map((f) => (
        <div key={f.name} className="flex items-center gap-2 border-b border-line-soft py-2.5 text-sm">
          <span className="flex flex-col gap-0.5">
            <strong className="font-semibold">{f.name}</strong>
            <span className="text-xs text-muted">{f.lastVisit}</span>
          </span>
          <span
            className={cn(
              "ms-auto rounded-full px-2.5 py-[3px] text-xs font-semibold",
              f.overdue ? "bg-danger-tint text-danger-ink" : "bg-line-soft text-ink-3",
            )}
          >
            {f.due}
          </span>
        </div>
      ))}
      <Link
        href={emrRoutes.scan}
        className="mt-3 flex items-center rounded-[14px] bg-brand-wash px-3.5 py-2.5 text-[13px] font-semibold text-brand-ink no-underline"
      >
        {filesAwaitingScan} files waiting to be scanned for visits 2 and 3
        <span className="ms-auto text-brand">Open scanning</span>
      </Link>
    </Panel>
  );
}
