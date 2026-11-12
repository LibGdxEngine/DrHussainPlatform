"use client";

import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { alertsApi, type PatientAlert } from "@/lib/api/emr/alerts";
import { ActionButton } from "../../ui/Action";
import { TextInput } from "../../ui/Fields";
import { Pill, type PillTone } from "../../ui/Pill";
import { alertSourceLabel } from "../labels";

const tone: Record<PatientAlert["level"], PillTone> = { red: "red", amber: "amber", reminder: "reminder" };
const levelText: Record<PatientAlert["level"], string> = { red: "Red", amber: "Amber", reminder: "Reminder" };

interface AlertsListProps {
  patient: string;
  /**
   * A results case's report: shows what this report fired plus the patient's open red answer alerts
   * (scope "case"), and no reminders.
   */
  report?: string;
  /** Called after the doctor acknowledges one, e.g. to reload a case it was holding back. */
  onAcknowledged?: () => void;
  /** Change it to reload the list, e.g. after an examination was saved. */
  refreshKey?: number;
  title?: string;
}

/** Open alert rules for a patient, each acknowledged by the doctor with a reason. */
export function AlertsList({ patient, report, onAcknowledged, refreshKey = 0, title = "Alerts from results" }: AlertsListProps) {
  const [loaded, setLoaded] = useState<{ alerts?: PatientAlert[]; error?: string } | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const query = report ? { patient, report, scope: "case" as const, status: "open" as const } : { patient, status: "open" as const };
    alertsApi.list(query).then(
      (page) => !cancelled && setLoaded({ alerts: page.results }),
      (err: unknown) => !cancelled && setLoaded({ error: apiErrorMessage(err, "Could not load the alerts.") }),
    );
    return () => {
      cancelled = true;
    };
  }, [patient, report, reloads, refreshKey]);

  if (loaded?.error) {
    return (
      <section aria-label="Alerts" className="flex flex-wrap items-center gap-2 rounded-2xl bg-danger-tint p-3.5 text-[13px]">
        <span role="alert" className="text-danger-ink">{loaded.error} Open alerts may not be shown.</span>
        <ActionButton variant="quiet" size="sm" className="ms-auto" onClick={() => setReloads((n) => n + 1)}>Try again</ActionButton>
      </section>
    );
  }
  const alerts = loaded?.alerts;
  if (!alerts?.length) return null;
  return (
    <section aria-label="Alerts" className="flex flex-col gap-2 rounded-2xl border border-line p-3.5">
      <h3 className="m-0 text-[13px] font-semibold">{title}</h3>
      {alerts.map((alert) => (
        <AlertRow
          key={alert.id}
          alert={alert}
          onDone={() => {
            setReloads((n) => n + 1);
            onAcknowledged?.();
          }}
        />
      ))}
    </section>
  );
}

function AlertRow({ alert, onDone }: { alert: PatientAlert; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true);
    setError(null);
    try {
      await alertsApi.acknowledge(alert.id, reason);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "Only the doctor can acknowledge alerts." : apiErrorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2 text-[13px] first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-emr-mono text-xs font-semibold">{alert.code}</span>
        <Pill tone={tone[alert.level]} size="xs">{levelText[alert.level]}</Pill>
        <span className="font-semibold">{alert.message}</span>
        <span className="text-xs text-muted">{alertSourceLabel(alert.source)}</span>
        <span className="text-xs text-muted">
          {alert.detail}
          {alert.result_date ? ` · ${new Date(alert.result_date).toLocaleDateString("en-GB")}` : ""}
          {alert.examined_on ? ` · exam ${new Date(alert.examined_on).toLocaleDateString("en-GB")}` : ""}
        </span>
        {!open ? (
          <ActionButton variant="quiet" size="sm" className="ms-auto" onClick={() => setOpen(true)}>Acknowledge</ActionButton>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            className="min-h-9 flex-1"
            placeholder="Reason, e.g. Dose reduced at this visit"
            aria-label={`Reason for acknowledging ${alert.code}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <ActionButton size="sm" disabled={busy || !reason.trim()} onClick={() => void acknowledge()}>Save</ActionButton>
          <ActionButton variant="quiet" size="sm" onClick={() => setOpen(false)}>Cancel</ActionButton>
        </div>
      ) : null}
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </div>
  );
}
