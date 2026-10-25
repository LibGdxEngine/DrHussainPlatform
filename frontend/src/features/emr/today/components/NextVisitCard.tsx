import { ActionLink } from "@/features/emr/ui/Action";
import { AlertPills, type AlertCounts } from "@/features/emr/ui/StatusPills";
import { Icon } from "@/features/emr/ui/icons";

interface NextVisitCardProps {
  time: string;
  name: string;
  summary: string;
  alerts: AlertCounts;
  href: string;
}

/** Highlight card for the next patient on the schedule. */
export function NextVisitCard({ time, name, summary, alerts, href }: NextVisitCardProps) {
  return (
    <section
      aria-label="Next visit"
      className="relative flex min-h-[300px] flex-col gap-2.5 overflow-hidden rounded-[22px] bg-gradient-to-br from-mint-1 to-[#cde6d7] p-[22px]"
    >
      <span className="self-start rounded-full bg-white px-3 py-[5px] text-xs font-semibold text-ok-ink">
        Next visit · {time}
      </span>
      <strong className="mt-1.5 text-2xl font-bold">{name}</strong>
      <span className="max-w-[190px] text-sm leading-relaxed text-ink-2">{summary}</span>
      <div className="max-w-[200px]">
        <AlertPills counts={alerts} />
      </div>
      <ActionLink href={href} variant="dark" className="mt-auto self-start px-[18px]" size="md">
        Open chart
        <Icon name="chevronRight" size={16} strokeWidth={2} />
      </ActionLink>
    </section>
  );
}
