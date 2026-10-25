import { Pill, type PillTone } from "./Pill";

export interface AlertCounts {
  red?: number;
  amber?: number;
  reminder?: number;
}

const alertDefs: { key: keyof AlertCounts; tone: PillTone; label: string }[] = [
  { key: "red", tone: "red", label: "أحمر" },
  { key: "amber", tone: "amber", label: "أصفر" },
  { key: "reminder", tone: "reminder", label: "تذكير" },
];

/** Row of "أحمر 1 / أصفر 2 / تذكير 2" pills; renders `empty` when there are none. */
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
  complete: { tone: "ok", label: "مكتملة" },
  inProgress: { tone: "amber", label: "جارية" },
  notStarted: { tone: "neutral", label: "مبدأتش" },
  sent: { tone: "neutral", label: "اتبعتت" },
};

/** Intake-form status pill shared by the dashboard and the patients list. */
export function FormStatusPill({ status }: { status: FormStatus }) {
  const d = formDefs[status];
  return <Pill tone={d.tone}>{d.label}</Pill>;
}
