"use client";

import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { activityApi, type ActivityGroup, type ActivityMember, type ActivityPage } from "@/lib/api/emr/alerts";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { actionText, outcomeLabel } from "../data";
import { FilterSelect } from "./FilterSelect";

const th = "border-y border-line bg-canvas-2 px-2 py-2.5 text-start text-xs font-medium text-muted";
const td = "border-b border-line-soft px-2 py-3";

type Period = "7" | "1" | "30" | "all";
const periods: { id: Period; label: string }[] = [
  { id: "7", label: "Last 7 days" },
  { id: "1", label: "Today" },
  { id: "30", label: "Last 30 days" },
  { id: "all", label: "All time" },
];
const groups: { id: ActivityGroup | "all"; label: string }[] = [
  { id: "all", label: "All actions" },
  { id: "view", label: "Viewed" },
  { id: "edit", label: "Changed" },
  { id: "send", label: "Sent" },
  { id: "alert", label: "Alerts" },
  { id: "signin", label: "Sign-ins" },
  { id: "denied", label: "Refused" },
];

function since(period: Period): string | undefined {
  if (period === "all") return undefined;
  const day = new Date();
  day.setDate(day.getDate() - (Number(period) - 1));
  return day.toISOString().slice(0, 10);
}

function details(d: Record<string, unknown>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}

/** The clinic's audit log, read from the platform. Doctor only. */
export function AuditLogPanel() {
  const [period, setPeriod] = useState<Period>("7");
  const [group, setGroup] = useState<ActivityGroup | "all">("all");
  const [actor, setActor] = useState("all");
  const [patient, setPatient] = useState("");
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [data, setData] = useState<{ key: string; page: ActivityPage } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    activityApi.members().then((m) => !cancelled && setMembers(m), () => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const key = `${period}|${group}|${actor}|${patient}|${page}`;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      activityApi
        .list({
          since: since(period), group: group === "all" ? undefined : group, actor: actor === "all" ? undefined : actor,
          patient: patient.trim() || undefined, page,
        })
        .then(
          (result) => !cancelled && setData({ key, page: result }),
          (err: unknown) => {
            if (cancelled) return;
            setError(err instanceof ApiError && err.status === 403 ? "Only the doctor can read the audit log." : apiErrorMessage(err, "Could not load the log."));
          },
        );
    }, patient ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [period, group, actor, patient, page, key]);

  const rows = data?.key === key ? data.page.results : null;
  const pages = data ? Math.max(1, Math.ceil(data.page.count / 20)) : 1;
  const reset = () => setPage(1);

  return (
    <Panel aria-label="Log" className="overflow-hidden">
      <div className="flex flex-wrap gap-2.5 px-5 py-[18px]">
        <FilterSelect label="Period" options={periods} value={period} onChange={(v) => { setPeriod(v); reset(); }} />
        <FilterSelect
          label="User"
          options={[{ id: "all", label: "All users" }, ...members.map((m) => ({ id: m.id, label: m.name }))]}
          value={actor}
          onChange={(v) => { setActor(v); reset(); }}
        />
        <FilterSelect label="Action" options={groups} value={group} onChange={(v) => { setGroup(v); reset(); }} />
        <input
          placeholder="File number"
          aria-label="File number"
          value={patient}
          onChange={(e) => { setPatient(e.target.value); reset(); }}
          className="min-h-[42px] w-40 rounded-full border border-field px-3.5 text-[13px] outline-none focus:border-brand"
        />
      </div>
      {error ? <p role="alert" className="m-0 px-5 pb-4 text-sm text-danger-ink">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${th} ps-5`}>Time</th>
              <th className={th}>Who</th>
              <th className={th}>Action</th>
              <th className={th}>Patient</th>
              <th className={th}>Details</th>
              <th className={`${th} pe-5`}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {!rows && !error ? (
              <tr><td colSpan={6} className={`${td} ps-5 text-muted`}>Loading…</td></tr>
            ) : null}
            {rows && !rows.length ? (
              <tr><td colSpan={6} className={`${td} ps-5 text-muted`}>Nothing logged for these filters.</td></tr>
            ) : null}
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className={`${td} ps-5 whitespace-nowrap text-xs text-ink-3`}>
                  {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <strong className="font-semibold">{r.actor_name}</strong>
                  <br />
                  <span className="text-[11px] text-muted">{r.actor_role || "—"}{r.ip_address ? ` · ${r.ip_address}` : ""}</span>
                </td>
                <td className={td}>{actionText(r.action)}</td>
                <td className={`${td} font-emr-mono text-xs`}>{r.patient ? r.patient.file_number : "—"}</td>
                <td className={`${td} max-w-[360px] text-ink-2`}>{details(r.details as Record<string, unknown>)}</td>
                <td className={`${td} pe-5`}>
                  <Pill tone={r.outcome === "success" ? "ok" : "danger"} size="xs" className="px-2.5">
                    {outcomeLabel[r.outcome as keyof typeof outcomeLabel] ?? r.outcome}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-xs text-muted">
        No one can edit or delete any row from the platform. Clinical values and note text are never written to the log.
        {pages > 1 ? (
          <span className="ms-auto flex items-center gap-2">
            <ActionButton variant="quiet" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</ActionButton>
            Page {page} of {pages}
            <ActionButton variant="quiet" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</ActionButton>
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
