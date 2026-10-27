import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PatientAlert } from "@/lib/api/emr/alerts";
import type { Appointment } from "@/lib/api/emr/appointments";
import type { MailThread } from "@/lib/api/emr/mail";
import type { RequestedTest } from "@/lib/api/emr/orders";
import { dayOf, localTime, relativeDay } from "@/features/emr/appointments/schedule";
import { formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import type { PatientRef } from "../patientRefs";

function visitHref(fileNumber: string) {
  return `${emrRoutes.visit}?patient=${encodeURIComponent(fileNumber)}`;
}

/** Loading, error and empty lines shared by the side panels. */
function PanelState({ loading, error, empty, emptyText }: { loading: boolean; error?: string; empty: boolean; emptyText: string }) {
  if (error) return <p role="alert" className="m-0 py-2 text-sm text-danger-ink">{error}</p>;
  if (loading) return <p className="m-0 py-2 text-sm text-muted">Loading…</p>;
  if (empty) return <p className="m-0 py-2 text-sm text-muted">{emptyText}</p>;
  return null;
}

interface Loadable<T> {
  items?: T[];
  error?: string;
}

const levelTone = { red: "red", amber: "amber", reminder: "reminder" } as const;
const levelLabel = { red: "Red", amber: "Amber", reminder: "Reminder" } as const;

/** Open alerts by patient. The top bar bell links here (#alerts). */
export function AlertsPanel({
  groups,
  error,
  patients,
  limit = 6,
}: {
  groups?: { patient: string; alerts: PatientAlert[] }[];
  error?: string;
  patients: Map<string, PatientRef>;
  limit?: number;
}) {
  const shown = groups?.slice(0, limit) ?? [];
  const more = (groups?.length ?? 0) - shown.length;
  return (
    <Panel id="alerts" variant="outline" aria-labelledby="al" className="flex scroll-mt-4 flex-col px-5 py-[18px]">
      <h2 id="al" className="m-0 mb-1 text-lg font-semibold">
        Open alerts
      </h2>
      <PanelState loading={!groups} error={error} empty={!!groups && groups.length === 0} emptyText="No open alerts." />
      {shown.map((g) => {
        const ref = patients.get(g.patient);
        const body = (
          <>
            <strong className="text-sm font-semibold">{ref ? ref.full_name : "Patient"}</strong>
            {g.alerts.slice(0, 3).map((a) => (
              <span key={a.id} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                <Pill tone={levelTone[a.level]} size="xs" className="mt-0.5">
                  {levelLabel[a.level]}
                </Pill>
                {a.message}
              </span>
            ))}
            {g.alerts.length > 3 ? <span className="text-xs text-muted">and {g.alerts.length - 3} more</span> : null}
          </>
        );
        return ref ? (
          <Link
            key={g.patient}
            href={visitHref(ref.file_number)}
            className="flex flex-col gap-1 border-b border-line-soft py-2.5 text-ink no-underline last:border-b-0 hover:text-brand"
          >
            {body}
          </Link>
        ) : (
          <div key={g.patient} className="flex flex-col gap-1 border-b border-line-soft py-2.5 last:border-b-0">
            {body}
          </div>
        );
      })}
      {more > 0 ? <span className="pt-2 text-xs text-muted">{more} more patients with open alerts</span> : null}
    </Panel>
  );
}

/** Tests the doctor requested that have not arrived yet, by patient. */
export function TestsToArrivePanel({
  groups,
  error,
  patients,
  limit = 5,
}: {
  groups?: { patient: string; tests: RequestedTest[] }[];
  error?: string;
  patients: Map<string, PatientRef>;
  limit?: number;
}) {
  const shown = groups?.slice(0, limit) ?? [];
  const more = (groups?.length ?? 0) - shown.length;
  return (
    <Panel variant="outline" aria-labelledby="ta" className="flex flex-col px-5 py-[18px]">
      <h2 id="ta" className="m-0 mb-1 text-lg font-semibold">
        Tests still to arrive
      </h2>
      <PanelState loading={!groups} error={error} empty={!!groups && groups.length === 0} emptyText="Every requested test has arrived." />
      {shown.map((g) => {
        const ref = patients.get(g.patient);
        return (
          <div key={g.patient} className="flex items-start gap-2 border-b border-line-soft py-2.5 text-sm last:border-b-0">
            <span className="flex min-w-0 flex-col gap-0.5">
              <strong className="font-semibold">{ref ? ref.full_name : "Patient"}</strong>
              <span className="text-xs leading-relaxed text-muted">
                {g.tests.map((t) => t.name).join(", ")} · requested {formatDay(g.tests[0].requested_at)}
              </span>
            </span>
            {ref ? (
              <Link
                href={`${emrRoutes.scan}?patient=${encodeURIComponent(ref.file_number)}`}
                className="ms-auto flex-none text-xs font-semibold text-brand no-underline"
              >
                Scan
              </Link>
            ) : null}
          </div>
        );
      })}
      {more > 0 ? <span className="pt-2 text-xs text-muted">{more} more patients waiting on tests</span> : null}
    </Panel>
  );
}

/** Unread emails from patients in the clinic inbox. */
export function PatientRepliesPanel({ items, error, limit = 4 }: Loadable<MailThread> & { limit?: number }) {
  const shown = items?.slice(0, limit) ?? [];
  return (
    <Panel variant="outline" aria-labelledby="rp" className="flex flex-col px-5 py-[18px]">
      <div className="mb-1 flex items-center">
        <h2 id="rp" className="m-0 text-lg font-semibold">
          Patient replies
        </h2>
        <Link href={emrRoutes.msgs} className="ms-auto text-sm font-semibold text-brand hover:text-brand-ink">
          Inbox
        </Link>
      </div>
      <PanelState loading={!items} error={error} empty={!!items && items.length === 0} emptyText="No unread emails." />
      {shown.map((t, i) => {
        const name = t.patient?.full_name || t.contact_name || t.contact_email;
        return (
          <Link
            key={t.id}
            href={`${emrRoutes.msgs}?thread=${encodeURIComponent(t.id)}`}
            className={cn("flex gap-3 py-3 text-ink no-underline", i < shown.length - 1 && "border-b border-line-soft")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-[38px] flex-none items-center justify-center rounded-full text-sm font-semibold uppercase",
                t.patient ? "bg-brand-tint text-brand-deep" : "bg-warn-tint text-warn-ink",
              )}
            >
              {name.charAt(0)}
            </span>
            <span className="flex min-w-0 flex-col gap-[3px]">
              <strong className="text-sm font-semibold">
                {name} · {formatDay(t.last_message_at)}
              </strong>
              <span className="truncate text-[13px] leading-relaxed text-muted">{t.subject || t.preview}</span>
              {t.patient ? null : <span className="text-xs text-warn-ink">Not matched to a patient yet</span>}
            </span>
          </Link>
        );
      })}
    </Panel>
  );
}

/** Follow-up and annual review visits booked in the next two weeks. */
export function FollowupsPanel({ items, error, today, limit = 6 }: Loadable<Appointment> & { today: string; limit?: number }) {
  const shown = items?.slice(0, limit) ?? [];
  const more = (items?.length ?? 0) - shown.length;
  return (
    <Panel variant="outline" aria-labelledby="fu" className="flex flex-col px-5 py-[18px]">
      <h2 id="fu" className="m-0 mb-1 text-lg font-semibold">
        Upcoming follow-ups
      </h2>
      <PanelState loading={!items} error={error} empty={!!items && items.length === 0} emptyText="No follow-ups booked in the next two weeks." />
      {shown.map((f) => {
        const day = dayOf(f.starts_at);
        return (
          <Link
            key={f.id}
            href={visitHref(f.patient.file_number)}
            className="flex items-center gap-2 border-b border-line-soft py-2.5 text-sm text-ink no-underline last:border-b-0 hover:text-brand"
          >
            <span className="flex flex-col gap-0.5">
              <strong className="font-semibold">{f.patient.full_name}</strong>
              <span className="text-xs text-muted">{f.kind_label}</span>
            </span>
            <span
              className={cn(
                "ms-auto whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold",
                day === today ? "bg-brand-tint text-brand-ink" : "bg-line-soft text-ink-3",
              )}
            >
              {relativeDay(day, today)} · {localTime(f.starts_at)}
            </span>
          </Link>
        );
      })}
      {more > 0 ? (
        <Link href={emrRoutes.appts} className="pt-2 text-xs font-semibold text-brand no-underline">
          {more} more in the schedule
        </Link>
      ) : null}
    </Panel>
  );
}
