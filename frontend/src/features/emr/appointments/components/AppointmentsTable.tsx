"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { appointmentsApi, type Appointment, type AppointmentStatus } from "@/lib/api/emr/appointments";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { intakeApi } from "@/lib/api/emr/intake";
import { formatDay } from "../../format";
import { emrRoutes } from "../../routes";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { dayTitle, formOutstanding, formState, formStateLabel, isOpenVisit, localTime } from "../schedule";
import { copyText, FormLink } from "./FormLink";

const rowGrid = "grid grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-3";

const closedStatus: Partial<Record<AppointmentStatus, string>> = {
  seen: "Seen",
  cancelled: "Cancelled",
  no_show: "Did not attend",
};

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

interface RowNote {
  error?: boolean;
  text: string;
  link?: string;
  copied?: boolean;
}

/** When and how the form link went out, for the caption under the form status. */
function formCaption(a: Appointment): string {
  const form = a.form;
  if (!form) return a.form_kind ? "No link sent yet" : "Brings her files; no form for this visit";
  if (form.submitted_at) return `Submitted ${formatDay(form.submitted_at)}`;
  const sent = form.sent_at
    ? `${form.sent_via === "copied" ? "Link copied" : "Emailed"} ${formatDay(form.sent_at)}`
    : "Link not sent";
  return form.opened_at ? `${sent} · opened` : `${sent} · not opened`;
}

interface RowProps {
  item: Appointment;
  busy?: string;
  note?: RowNote;
  onCheckIn: () => void;
  onEmail: () => void;
  onCopy: () => void;
  onStatus: (status: "cancelled" | "no_show") => void;
}

function AppointmentRow({ item: a, busy, note, onCheckIn, onEmail, onCopy, onStatus }: RowProps) {
  const fs = formState(a);
  const pill = formStateLabel[fs];
  const open = isOpenVisit(a.status);
  const canSendForm = open && formOutstanding(fs) && fs !== "locked";
  const closed = closedStatus[a.status];
  const patientHref = `${emrRoutes.visit}?patient=${encodeURIComponent(a.patient.file_number)}`;

  return (
    <div className={cn("border-b border-line-soft px-1 py-3", !open && "opacity-70")}>
      <div className={rowGrid}>
        <span className="pt-0.5 font-emr-mono text-[13px] text-ink-3">{localTime(a.starts_at)}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link href={patientHref} className="text-sm font-semibold text-ink no-underline hover:text-brand">
            {a.patient.full_name}
          </Link>
          <span className="text-xs text-muted">
            <span className="font-emr-mono">{a.patient.file_number}</span> · {a.patient.age} yrs · {a.kind_label}
            {a.reason ? ` · ${a.reason}` : ""}
          </span>
          {a.needs_scanning && open ? (
            <Link
              href={`${emrRoutes.scan}?patient=${encodeURIComponent(a.patient.file_number)}`}
              className="text-xs font-semibold text-brand no-underline"
            >
              Scan the files she brought
            </Link>
          ) : null}
        </span>
        <span className="flex flex-col items-start gap-1">
          <span className="flex flex-wrap gap-1">
            {closed ? <Pill tone={a.status === "seen" ? "ok" : "danger"}>{closed}</Pill> : null}
            {a.status === "checked_in" ? <Pill tone="brand">Checked in</Pill> : null}
            {fs !== "none" ? <Pill tone={pill.tone}>Form: {pill.label}</Pill> : null}
          </span>
          <span className="text-xs text-muted">
            {a.status === "checked_in" && a.checked_in_at
              ? `Arrived ${localTime(a.checked_in_at)}${a.checked_in_by_name ? ` · ${a.checked_in_by_name}` : ""}`
              : formCaption(a)}
          </span>
        </span>
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 ps-[68px]">
          {a.status === "booked" ? (
            <ActionButton size="sm" variant={formOutstanding(fs) ? "quiet" : "primary"} disabled={!!busy} onClick={onCheckIn}>
              {busy === "checkin" ? "Checking in…" : "Check in"}
            </ActionButton>
          ) : null}
          {canSendForm ? (
            <>
              <ActionButton
                size="sm"
                variant={fs === "notSent" ? "primary" : "quiet"}
                disabled={!!busy || !a.patient.has_email}
                title={a.patient.has_email ? undefined : "No email address on file. Copy the link instead."}
                onClick={onEmail}
              >
                {busy === "email" ? "Sending…" : fs === "notSent" ? "Email form link" : "Resend by email"}
              </ActionButton>
              <ActionButton size="sm" variant="quiet" disabled={!!busy} onClick={onCopy}>
                {busy === "copy" ? "Making link…" : "Copy link"}
              </ActionButton>
            </>
          ) : null}
          <span className="ms-auto flex gap-3 text-xs">
            {a.status === "booked" ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => onStatus("no_show")}
                className="cursor-pointer text-muted hover:text-ink disabled:cursor-not-allowed"
              >
                Did not attend
              </button>
            ) : null}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onStatus("cancelled")}
              className="cursor-pointer text-danger-ink hover:underline disabled:cursor-not-allowed"
            >
              Cancel visit
            </button>
          </span>
        </div>
      ) : null}
      {note ? (
        <div className="mt-2 flex flex-col gap-2 ps-[68px]">
          <p role={note.error ? "alert" : "status"} className={cn("m-0 text-xs", note.error ? "text-danger-ink" : "text-ok-ink")}>
            {note.text}
          </p>
          {note.link ? <FormLink link={note.link} copied={note.copied} /> : null}
        </div>
      ) : null}
    </div>
  );
}

interface AppointmentsTableProps {
  day: string | null;
  /** Bumped whenever the schedule changed elsewhere (a booking), so the list reloads. */
  version: number;
  /** Called after a change that alters the day counts or the form status. */
  onChanged: () => void;
}

/** One day's schedule with reception's actions: check in, send or copy the form link, cancel. */
export function AppointmentsTable({ day, version, onChanged }: AppointmentsTableProps) {
  const [state, setState] = useState<{ day: string; rows?: Appointment[]; error?: string } | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, RowNote>>({});

  useEffect(() => {
    if (!day) return;
    let cancelled = false;
    appointmentsApi.list({ date: day, include_cancelled: true }).then(
      (rows) => {
        if (!cancelled) setState({ day, rows });
      },
      (err: unknown) => {
        if (!cancelled) setState({ day, error: apiErrorMessage(err, "Could not load the schedule.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [day, version]);

  const current = day && state?.day === day ? state : null;
  const rows = current?.rows;

  const replace = (updated: Appointment) =>
    setState((s) => (s?.rows ? { ...s, rows: s.rows.map((r) => (r.id === updated.id ? updated : r)) } : s));

  async function run(a: Appointment, action: string, work: () => Promise<RowNote | null>) {
    setBusy((b) => ({ ...b, [a.id]: action }));
    setNotes((n) => without(n, a.id));
    let note: RowNote | null;
    try {
      note = await work();
    } catch (err) {
      note = { error: true, text: apiErrorMessage(err, "That did not work. Check the connection and try again.") };
      if (err instanceof ApiError && (err.code === "NO_RECIPIENT" || err.code === "MAILBOX_NOT_READY")) {
        note.text += " Use Copy link to send it by WhatsApp.";
      }
    }
    setBusy((b) => without(b, a.id));
    if (note) setNotes((n) => ({ ...n, [a.id]: note }));
  }

  const checkIn = (a: Appointment) =>
    run(a, "checkin", async () => {
      replace(await appointmentsApi.checkIn(a.id));
      return null;
    });

  const email = (a: Appointment) =>
    run(a, "email", async () => {
      await (a.form
        ? intakeApi.send(a.form.id)
        : intakeApi.issue({ patient: a.patient.id, appointment: a.id, send_email: true }));
      onChanged();
      return { text: "Form link emailed to the patient. Any earlier link no longer works." };
    });

  const copy = (a: Appointment) =>
    run(a, "copy", async () => {
      const { link } = await (a.form
        ? intakeApi.copyLink(a.form.id)
        : intakeApi.issue({ patient: a.patient.id, appointment: a.id, send_email: false }));
      const copied = await copyText(link);
      onChanged();
      return { text: copied ? "New form link copied." : "New form link ready.", link, copied };
    });

  const setStatus = (a: Appointment, status: "cancelled" | "no_show") => {
    const what = status === "cancelled" ? "Cancel this visit" : "Mark that she did not attend";
    if (!window.confirm(`${what}: ${a.patient.full_name} at ${localTime(a.starts_at)}?`)) return;
    return run(a, status, async () => {
      replace(await appointmentsApi.update(a.id, { status }));
      onChanged();
      return null;
    });
  };

  const active = rows?.filter((r) => r.status !== "cancelled").length ?? 0;

  return (
    <Panel aria-labelledby="sch" className="flex flex-col gap-1.5 p-5">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 id="sch" className="m-0 text-lg font-semibold">
          Schedule{day ? ` · ${dayTitle(day)}` : ""}
        </h2>
        {rows ? (
          <span className="ms-auto text-xs text-muted">
            {active} {active === 1 ? "visit" : "visits"}
          </span>
        ) : null}
      </div>
      {current?.error ? (
        <p role="alert" className="m-0 text-sm text-danger-ink">{current.error}</p>
      ) : null}
      {!current ? <p className="m-0 text-sm text-muted">Loading…</p> : null}
      {rows && rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">No visits booked for this day. Book one on the right.</p>
      ) : null}
      {(rows ?? []).map((a) => (
        <AppointmentRow
          key={a.id}
          item={a}
          busy={busy[a.id]}
          note={notes[a.id]}
          onCheckIn={() => checkIn(a)}
          onEmail={() => email(a)}
          onCopy={() => copy(a)}
          onStatus={(status) => setStatus(a, status)}
        />
      ))}
    </Panel>
  );
}
