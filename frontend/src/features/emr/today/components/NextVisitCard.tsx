import type { Appointment } from "@/lib/api/emr/appointments";
import { localTime } from "@/features/emr/appointments/schedule";
import { emrRoutes } from "@/features/emr/routes";
import { ActionLink } from "@/features/emr/ui/Action";
import { AlertPills, type AlertCounts } from "@/features/emr/ui/StatusPills";
import { Icon } from "@/features/emr/ui/icons";

interface NextVisitCardProps {
  /** undefined while loading; null when nobody is left to see today. */
  visit?: Appointment | null;
  alerts?: AlertCounts;
}

/** Highlight card for the next patient on today's schedule. */
export function NextVisitCard({ visit, alerts = {} }: NextVisitCardProps) {
  return (
    <section
      aria-label="Next visit"
      className="relative flex min-h-[300px] flex-col gap-2.5 overflow-hidden rounded-[22px] bg-gradient-to-br from-mint-1 to-[#cde6d7] p-[22px]"
    >
      {visit ? (
        <>
          <span className="self-start rounded-full bg-white px-3 py-[5px] text-xs font-semibold text-ok-ink">
            {visit.status === "checked_in" ? "In the clinic" : "Next visit"} · {localTime(visit.starts_at)}
          </span>
          <strong className="mt-1.5 text-2xl font-bold">
            {visit.patient.full_name}, {visit.patient.age}
          </strong>
          <span className="max-w-[220px] text-sm leading-relaxed text-ink-2">
            {visit.kind_label}
            {visit.reason ? ` · ${visit.reason}` : ""}
          </span>
          <div className="max-w-[220px]">
            <AlertPills counts={alerts} />
          </div>
          <ActionLink
            href={`${emrRoutes.visit}?patient=${encodeURIComponent(visit.patient.file_number)}`}
            variant="dark"
            className="mt-auto self-start px-[18px]"
            size="md"
          >
            Open chart
            <Icon name="chevronRight" size={16} strokeWidth={2} />
          </ActionLink>
        </>
      ) : (
        <>
          <span className="self-start rounded-full bg-white px-3 py-[5px] text-xs font-semibold text-ok-ink">
            Next visit
          </span>
          <span className="mt-1.5 text-sm leading-relaxed text-ink-2">
            {visit === undefined ? "Loading…" : "No more visits to see today."}
          </span>
          <ActionLink href={emrRoutes.appts} variant="dark" className="mt-auto self-start px-[18px]" size="md">
            Schedule
            <Icon name="chevronRight" size={16} strokeWidth={2} />
          </ActionLink>
        </>
      )}
    </section>
  );
}
