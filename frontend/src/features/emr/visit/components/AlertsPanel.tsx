"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { alertsApi, type PatientAlert } from "@/lib/api/emr/alerts";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { formatDay } from "../../format";
import { usePatientResource } from "../../journey/usePatientResource";
import { ActionButton } from "../../ui/Action";
import { SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { MAX_PAGE_SIZE } from "@/lib/api/emr/page";

const loadAlerts = (patient: string) =>
  alertsApi.list({ patient, status: "open", page_size: MAX_PAGE_SIZE }).then((page) => page.results);

const rowTone: Record<PatientAlert["level"], string> = {
  red: "bg-danger-tint",
  amber: "bg-warn-wash",
  reminder: "bg-canvas",
};
const levelText: Record<PatientAlert["level"], string> = { red: "Red", amber: "Amber", reminder: "Reminder" };

const OTHER = "Other reason (write below)";
const ackReasons = [
  "Reviewed, no action needed",
  "Discussed with the patient",
  "Repeat test ordered",
  "Treatment changed at this visit",
  OTHER,
];

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

interface AlertRowProps {
  alert: PatientAlert;
  isLead: boolean;
  onAcknowledged: (alert: PatientAlert) => void;
}

function AlertRow({ alert, isLead, onAcknowledged }: AlertRowProps) {
  const [asking, setAsking] = useState(false);
  const [choice, setChoice] = useState(ackReasons[0]);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acknowledged = alert.status !== "open";
  const reason = choice === OTHER ? other.trim() : choice;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onAcknowledged(await alertsApi.acknowledge(alert.id, reason));
      setAsking(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403
        ? "Only the doctor can acknowledge alerts."
        : apiErrorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  const source = [alert.detail, alert.value_text, alert.result_date ? formatDay(alert.result_date) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl px-3.5 py-3",
        acknowledged ? "bg-canvas opacity-75" : rowTone[alert.level],
      )}
    >
      <div className="flex items-center gap-3">
        <Pill tone={alert.level} size="xs" className="shrink-0 px-2.5 py-1">
          {levelText[alert.level]} · {alert.code}
        </Pill>
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-sm font-semibold leading-normal">{alert.message}</strong>
          {source ? <span className="text-xs text-muted">{source}</span> : null}
        </div>
        {!acknowledged && isLead && !asking ? (
          <ActionButton
            variant="quiet"
            size="sm"
            onClick={() => setAsking(true)}
            className="ms-auto shrink-0 border-ink bg-white hover:bg-ink hover:text-white"
          >
            Confirm
          </ActionButton>
        ) : null}
        {acknowledged ? (
          <span className="ms-auto shrink-0 text-xs font-semibold text-ok-ink">
            ✓ Confirmed by {alert.acknowledged_by_name || "the doctor"}
            {alert.acknowledged_at ? ` · ${timeFormat.format(new Date(alert.acknowledged_at))}` : ""}
          </span>
        ) : null}
      </div>
      {acknowledged && alert.reason ? <span className="text-xs text-muted">Reason: {alert.reason}</span> : null}
      {asking ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            Reason
            <SelectInput
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="min-h-[38px] w-auto rounded-[10px] text-[13px]"
            >
              {ackReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </SelectInput>
          </label>
          {choice === OTHER ? (
            <TextInput
              aria-label={`Reason for confirming ${alert.code}`}
              value={other}
              maxLength={500}
              onChange={(e) => setOther(e.target.value)}
              className="min-h-[38px] flex-1 rounded-[10px] text-[13px]"
            />
          ) : null}
          <ActionButton
            variant="primary"
            size="sm"
            disabled={busy || !reason}
            onClick={() => void confirm()}
            className="min-h-[38px] px-4"
          >
            Confirm
          </ActionButton>
          <ActionButton variant="quiet" size="sm" onClick={() => setAsking(false)} className="min-h-[38px]">
            Cancel
          </ActionButton>
          <span className="basis-full text-xs text-muted">Logged with your name and the time.</span>
          {error ? (
            <span role="alert" className="basis-full text-xs text-danger-ink">{error}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Open alerts raised by the clinic's rules on this patient's results; the doctor confirms each with a reason. */
export function AlertsPanel({ patientId, isLead }: { patientId: string; isLead: boolean }) {
  const alerts = usePatientResource(patientId, loadAlerts, "Could not load the alerts.");
  const list = alerts.data;
  const open = list?.filter((a) => a.status === "open").length ?? 0;

  return (
    <Panel aria-labelledby="al" className="flex flex-col gap-2.5 p-5">
      <h2 id="al" className="m-0 mb-1 text-lg font-semibold">
        Alerts{list ? ` (${open})` : ""}
      </h2>
      {alerts.error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{alerts.error}</p>
      ) : !list ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !list.length ? (
        <p className="m-0 text-[13px] text-muted">No open alerts from this patient&apos;s results.</p>
      ) : (
        <>
          {list.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              isLead={isLead}
              onAcknowledged={(saved) => alerts.update((rows) => rows.map((r) => (r.id === saved.id ? saved : r)))}
            />
          ))}
          {!isLead && open ? <p className="m-0 text-xs text-muted">Only the doctor can confirm alerts.</p> : null}
        </>
      )}
    </Panel>
  );
}
