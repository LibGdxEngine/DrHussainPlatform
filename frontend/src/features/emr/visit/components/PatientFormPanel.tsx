"use client";

import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { intakeApi, type ExtraModule } from "@/lib/api/emr/intake";
import { copyText, FormLink } from "../../appointments/components/FormLink";
import { formatDay } from "../../format";
import { extraModuleLabels } from "../../intake/data";
import { toggleIn } from "../../intake/logic";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { formStatusText, formStatusTone, readAnswers, reasonLabel } from "../answers";
import type { LatestForm } from "../forms";

interface PatientFormPanelProps {
  form?: LatestForm;
  error?: string;
  /** The patient, for sending a new form; taken from her earlier forms when not given. */
  patientId?: string;
}

const extraModules = Object.keys(extraModuleLabels) as ExtraModule[];

type Note = { text: string; error?: boolean; link?: string; copied?: boolean };

/** Issue a new history form, with any sections staff add on top of the ones her answers will open. */
function NewForm({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<ExtraModule[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function issue(sendEmail: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const { link } = await intakeApi.issue({ patient: patientId, kind: "full", send_email: sendEmail, extra_modules: modules });
      if (sendEmail) {
        setNote({ text: "Form link emailed to the patient. Any earlier link no longer works." });
      } else {
        const copied = await copyText(link);
        setNote({ text: copied ? "New form link copied." : "New form link ready.", link, copied });
      }
    } catch (err) {
      let text = apiErrorMessage(err, "That did not work. Check the connection and try again.");
      if (err instanceof ApiError && (err.code === "NO_RECIPIENT" || err.code === "MAILBOX_NOT_READY")) {
        text += " Use Copy link to send it by WhatsApp.";
      }
      setNote({ text, error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <ActionButton variant="quiet" size="sm" onClick={() => setOpen(true)} className="self-start">
        Send a new form…
      </ActionButton>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-canvas px-3.5 py-3">
      <span className="text-[13px] font-semibold">Add sections to the new form (optional)</span>
      <span className="text-xs text-muted">Her answers open the other sections by themselves.</span>
      <div role="group" aria-label="Sections to add" className="flex flex-wrap gap-1.5">
        {extraModules.map((m) => {
          const on = modules.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => setModules((prev) => toggleIn(prev, m))}
              className={
                on
                  ? "min-h-9 cursor-pointer rounded-full border-2 border-brand bg-brand-tint px-3 text-xs font-semibold text-brand-ink"
                  : "min-h-9 cursor-pointer rounded-full border border-field bg-white px-3 text-xs"
              }
            >
              {on ? "✓ " : ""}{extraModuleLabels[m]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton size="sm" disabled={busy} onClick={() => void issue(true)}>Email the form</ActionButton>
        <ActionButton size="sm" variant="quiet" disabled={busy} onClick={() => void issue(false)}>Copy link</ActionButton>
        <ActionButton size="sm" variant="quiet" disabled={busy} onClick={() => setOpen(false)}>Close</ActionButton>
      </div>
      {note ? (
        <span role={note.error ? "alert" : "status"} className={note.error ? "text-xs text-danger-ink" : "text-xs text-ok-ink"}>
          {note.text}
        </span>
      ) : null}
      {note?.link ? <FormLink link={note.link} copied={note.copied} /> : null}
    </div>
  );
}

/** The history form the patient filled in on her phone: status, reasons for the visit and her own words. */
export function PatientFormPanel({ form, error, patientId }: PatientFormPanelProps) {
  const latest = form?.latest;
  const newest = form?.latestAny ?? latest;
  const answered = form?.answered;
  const answers = readAnswers(answered?.answers);
  const olderAnswers = answered && latest && answered.id !== latest.id;
  const patient = patientId ?? newest?.patient ?? answered?.patient;

  return (
    <Panel aria-labelledby="hw" className="flex flex-col gap-2.5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hw" className="m-0 text-lg font-semibold">
          In her words &amp; reasons
        </h2>
        {form ? (
          <Pill tone={newest ? formStatusTone[newest.status] : "neutral"} size="xs" className="ms-auto">
            Patient form · {formStatusText(newest)}
          </Pill>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{error}</p>
      ) : !form ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !answered ? (
        <p className="m-0 text-[13px] text-muted">
          {latest ? "The patient has not completed her form yet." : "No patient form has been sent. Reception sends it when booking."}
        </p>
      ) : (
        <>
          {olderAnswers ? (
            <p className="m-0 text-xs text-muted">Answers below are from the form she completed {formatDay(answered.submitted_at)}.</p>
          ) : null}
          {answers.reasons.length ? (
            <div className="flex flex-wrap gap-1.5">
              {answers.reasons.map((r) => (
                <Pill key={r} tone="brand" size="sm">
                  {reasonLabel(r)}
                </Pill>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted">No reason for the visit was ticked.</p>
          )}
          {answers.other_reason ? (
            <p className="m-0 text-sm">
              <span className="text-muted">Something else: </span>
              {answers.other_reason}
            </p>
          ) : null}
          {answers.notes ? (
            <p className="m-0 text-base leading-[1.8]">&ldquo;{answers.notes}&rdquo;</p>
          ) : (
            <p className="m-0 text-[13px] text-muted">She did not add anything in her own words.</p>
          )}
        </>
      )}
      {form && patient ? <NewForm patientId={patient} /> : null}
    </Panel>
  );
}
