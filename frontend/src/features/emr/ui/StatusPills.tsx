import { Pill, type PillTone } from "./Pill";

export interface AlertCounts {
  red?: number;
  amber?: number;
  reminder?: number;
}

const alertDefs: { key: keyof AlertCounts; tone: PillTone; label: string }[] = [
  { key: "red", tone: "red", label: "Red" },
  { key: "amber", tone: "amber", label: "Amber" },
  { key: "reminder", tone: "reminder", label: "Reminder" },
];

/** Row of "Red 1 / Amber 2 / Reminder 2" pills; renders `empty` when there are none. */
export function AlertPills({
  counts,
  size = "sm",
  empty,
}: {
  counts: AlertCounts;
  size?: "xs" | "sm" | "md";
  empty?: string;
}) {
  const shown = alertDefs.filter((d) => counts[d.key]);
  if (shown.length === 0) {
    return empty ? <span className="text-[13px] text-subtle">{empty}</span> : null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((d) => (
        <Pill key={d.key} tone={d.tone} size={size}>
          {d.label} {counts[d.key]}
        </Pill>
      ))}
    </div>
  );
}

export type FormStatus = "complete" | "inProgress" | "notStarted" | "sent";

const formDefs: Record<FormStatus, { tone: PillTone; label: string }> = {
  complete: { tone: "ok", label: "Complete" },
  inProgress: { tone: "amber", label: "In progress" },
  notStarted: { tone: "neutral", label: "Not started" },
  sent: { tone: "neutral", label: "Sent" },
};

/** Intake-form status pill shared by the dashboard and the patients list. */
export function FormStatusPill({ status }: { status: FormStatus }) {
  const d = formDefs[status];
  return <Pill tone={d.tone}>{d.label}</Pill>;
}
