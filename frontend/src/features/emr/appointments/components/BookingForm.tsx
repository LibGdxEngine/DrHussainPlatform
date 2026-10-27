"use client";

import { useCallback, useState } from "react";
import { appointmentsApi, type Appointment, type AppointmentBooked, type VisitKind } from "@/lib/api/emr/appointments";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import type { Patient } from "@/lib/api/emr/patients";
import { formatDay } from "../../format";
import { usePatientByFileNumber } from "../../shell/usePatientByFileNumber";
import { ActionButton } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { useLoad, usePatientSearch } from "../hooks";
import { dayOf, localTime, relativeDay, startsAt } from "../schedule";
import { FormLink } from "./FormLink";

function PatientPicker({ onPick }: { onPick: (patient: Patient) => void }) {
  const [query, setQuery] = useState("");
  const { results, error } = usePatientSearch(query);
  return (
    <div className="flex flex-col gap-2">
      <Field label="Patient">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name (English or Arabic), file number or mobile"
          autoComplete="off"
        />
      </Field>
      {error ? <p role="alert" className="m-0 text-xs text-danger-ink">{error}</p> : null}
      {results && results.length === 0 ? (
        <p className="m-0 text-xs text-muted">No patient matches. Add her on the Patients screen first.</p>
      ) : null}
      {results?.length ? (
        <ul aria-label="Matching patients" className="m-0 flex list-none flex-col rounded-[14px] border border-line p-0">
          {results.map((p) => (
            <li key={p.id} className="border-b border-line-soft last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3.5 py-2.5 text-start hover:bg-brand-wash"
              >
                <strong className="text-sm font-semibold">
                  {p.full_name}
                  {p.full_name_ar ? <span dir="auto" className="font-normal text-muted"> · {p.full_name_ar}</span> : null}
                </strong>
                <span className="text-xs text-muted">
                  <span className="font-emr-mono">{p.file_number}</span> · born {formatDay(p.date_of_birth)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface BookingFormProps {
  today: string | null;
  /** The day shown in the schedule; new bookings default to it. */
  day: string | null;
  /** A `?patient=VC-…` file number to preselect. */
  initialFileNumber?: string;
  onBooked: (appointment: Appointment) => void;
}

/** "Book a visit" panel: patient, slot, visit kind, and the patient form link by email. */
export function BookingForm({ today, day, initialFileNumber, onBooked }: BookingFormProps) {
  const preset = usePatientByFileNumber(initialFileNumber);
  const kinds = useLoad(useCallback(() => appointmentsApi.kinds(), []), "Could not load the visit kinds.");

  // undefined: still the ?patient= one (if any); null: cleared by the user.
  const [chosen, setChosen] = useState<Patient | null | undefined>(undefined);
  const patient = chosen === undefined ? preset.patient : chosen;
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<VisitKind | "">("");
  const [reason, setReason] = useState("");
  const [sendForm, setSendForm] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<AppointmentBooked | null>(null);

  const visitDay = date || day || today || "";
  const formKind = kinds.data?.find((k) => k.id === kind)?.form_kind ?? "";
  const needsForm = formKind !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient || !visitDay || !time || !kind) {
      setError("Choose the patient, the date, the time and the visit kind.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await appointmentsApi.book({
        patient: patient.id,
        starts_at: startsAt(visitDay, time),
        kind,
        reason: reason.trim(),
        send_form: needsForm && sendForm,
      });
      setBooked(result);
      setTime("");
      setReason("");
      onBooked(result.appointment);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not book the visit."));
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setBooked(null);
    setChosen(null);
    setKind("");
  };

  if (booked) {
    const a = booked.appointment;
    return (
      <Panel aria-labelledby="bk" className="flex flex-col gap-3.5 p-5">
        <h2 id="bk" className="m-0 text-lg font-semibold">
          Visit booked
        </h2>
        <p role="status" className="m-0 text-sm leading-relaxed">
          <strong>{a.patient.full_name}</strong> · {a.kind_label} · {relativeDay(dayOf(a.starts_at), today ?? "")} at{" "}
          {localTime(a.starts_at)}.
        </p>
        {booked.form_notice ? (
          <p className={booked.form_link ? "m-0 rounded-[14px] bg-warn-wash px-3.5 py-3 text-[13px] leading-relaxed text-warn-ink" : "m-0 text-[13px] text-ok-ink"}>
            {booked.form_notice}
          </p>
        ) : null}
        {booked.form_link ? <FormLink link={booked.form_link} /> : null}
        <ActionButton variant="quiet" onClick={startOver}>
          Book another visit
        </ActionButton>
      </Panel>
    );
  }

  return (
    <Panel as="section" aria-labelledby="bk" className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <h2 id="bk" className="m-0 text-lg font-semibold">
          Book a visit
        </h2>
        {patient ? (
          <div className="flex items-start gap-3 rounded-[14px] bg-brand-wash px-3.5 py-3 text-sm">
            <span className="flex min-w-0 flex-col gap-0.5">
              <strong className="font-semibold">{patient.full_name}</strong>
              <span className="text-xs text-muted">
                <span className="font-emr-mono">{patient.file_number}</span> · born {formatDay(patient.date_of_birth)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="ms-auto cursor-pointer text-xs font-semibold text-brand"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            {initialFileNumber && chosen === undefined && !preset.message ? (
              <p className="m-0 text-xs text-muted">Loading {initialFileNumber}…</p>
            ) : null}
            {preset.message && chosen === undefined ? (
              <p role="alert" className="m-0 text-xs text-danger-ink">
                {initialFileNumber}: {preset.message}
              </p>
            ) : null}
            <PatientPicker onPick={setChosen} />
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" min={today ?? undefined} value={visitDay} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Time">
            <TextInput type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Visit kind">
          <SelectInput value={kind} onChange={(e) => setKind(e.target.value as VisitKind | "")} required>
            <option value="">{kinds.data ? "Choose…" : "Loading…"}</option>
            {(kinds.data ?? []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        {kinds.error ? <p role="alert" className="m-0 text-xs text-danger-ink">{kinds.error}</p> : null}
        <Field label="Reason (optional)">
          <TextInput value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="e.g. hot flushes, bleeding" />
        </Field>
        {kind && needsForm ? (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-line px-3.5 py-3 text-sm">
            <label className="flex items-center gap-2.5 font-medium">
              <input
                type="checkbox"
                checked={sendForm}
                onChange={(e) => setSendForm(e.target.checked)}
                className="size-[17px] accent-brand"
              />
              Send the {formKind === "full" ? "full history" : "short follow-up"} form link
            </label>
            <span className="text-xs leading-relaxed text-muted">
              {!patient
                ? "Choose the patient to see where the link goes."
                : patient.email
                  ? <>Emailed to <span className="font-emr-mono">{patient.email}</span> from the clinic mailbox. If it can&apos;t be sent, you get a link to copy into WhatsApp.</>
                  : "She has no email on file: you get a link to copy into WhatsApp."}
            </span>
          </div>
        ) : kind ? (
          <p className="m-0 text-xs text-muted">This visit needs no form: she brings her test results, scanned at reception.</p>
        ) : null}
        {error ? <p role="alert" className="m-0 text-sm text-danger-ink">{error}</p> : null}
        <ActionButton type="submit" size="lg" disabled={submitting} className="w-full">
          {submitting ? "Booking…" : needsForm && sendForm ? "Book and send form link" : "Book visit"}
        </ActionButton>
      </form>
    </Panel>
  );
}
