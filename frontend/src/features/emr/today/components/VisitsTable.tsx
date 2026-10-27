import Link from "next/link";
import type { Appointment, AppointmentStatus } from "@/lib/api/emr/appointments";
import { formState, formStateLabel, isOpenVisit, localTime } from "@/features/emr/appointments/schedule";
import { emrRoutes } from "@/features/emr/routes";
import { ActionLink } from "@/features/emr/ui/Action";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { AlertPills, type AlertCounts } from "@/features/emr/ui/StatusPills";
import { Table, Td, Th } from "@/features/emr/ui/Table";

const columns = ["Time", "Patient", "Visit", "Form", "Alerts", "MRS"];

const statusNote: Partial<Record<AppointmentStatus, string>> = {
  checked_in: "Checked in",
  seen: "Seen",
  no_show: "Did not attend",
};

interface VisitsTableProps {
  /** undefined while loading. */
  visits?: Appointment[];
  error?: string;
  alerts: Map<string, AlertCounts>;
}

export function VisitsTable({ visits, error, alerts }: VisitsTableProps) {
  return (
    <Panel variant="outline" aria-labelledby="tv" className="overflow-hidden">
      <div className="flex items-center px-5 pb-2.5 pt-[18px]">
        <h2 id="tv" className="m-0 text-lg font-semibold">
          Today&apos;s visits
        </h2>
        <Link href={emrRoutes.appts} className="ms-auto text-sm font-semibold text-brand hover:text-brand-ink">
          Full schedule
        </Link>
      </div>
      {error ? <p role="alert" className="m-0 px-5 pb-3 text-sm text-danger-ink">{error}</p> : null}
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
              <Th />
            </tr>
          </thead>
          <tbody>
            {!visits && !error ? (
              <tr>
                <Td colSpan={columns.length + 1} className="text-muted">Loading…</Td>
              </tr>
            ) : null}
            {visits && visits.length === 0 ? (
              <tr>
                <Td colSpan={columns.length + 1} className="text-center text-muted">No visits booked today.</Td>
              </tr>
            ) : null}
            {(visits ?? []).map((v) => {
              const fs = formState(v);
              const href = `${emrRoutes.visit}?patient=${encodeURIComponent(v.patient.file_number)}`;
              return (
                <tr key={v.id} className={isOpenVisit(v.status) ? undefined : "opacity-60"}>
                  <Td className="font-emr-mono text-[13px] text-ink-3">
                    {localTime(v.starts_at)}
                    {statusNote[v.status] ? (
                      <span className="block font-sans text-[11px] text-muted">{statusNote[v.status]}</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Link href={href} className="font-semibold text-ink no-underline hover:text-brand">
                      {v.patient.full_name}
                    </Link>
                    <span className="text-muted">, {v.patient.age}</span>
                    <span className="block font-emr-mono text-xs text-muted">{v.patient.file_number}</span>
                  </Td>
                  <Td className="text-[13px] text-ink-2">
                    {v.kind_label}
                    {v.reason ? <span className="block text-xs text-muted">{v.reason}</span> : null}
                  </Td>
                  <Td>
                    {fs === "none" ? (
                      <span className="text-[13px] text-subtle">No form</span>
                    ) : (
                      <Pill tone={formStateLabel[fs].tone}>{formStateLabel[fs].label}</Pill>
                    )}
                  </Td>
                  <Td>
                    <AlertPills counts={alerts.get(v.patient.id) ?? {}} size="sm" empty="None" />
                  </Td>
                  <Td className="whitespace-nowrap font-semibold">{v.form?.mrs_total ?? "—"}</Td>
                  <Td className="text-end">
                    <ActionLink href={href} variant="quiet" size="sm" className="whitespace-nowrap">
                      Open
                    </ActionLink>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}
