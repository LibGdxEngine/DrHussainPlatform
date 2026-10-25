"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { caseRequestText } from "@/features/emr/journey/data";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton } from "@/features/emr/ui/Action";
import { SelectInput, TextArea } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { documentsApi, type PatientDocument } from "@/lib/api/emr/documents";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { mailApi, type MailThreadDetail } from "@/lib/api/emr/mail";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";
import { MessageBubble } from "./MessageBubble";

interface ThreadPanelProps {
  thread: MailThreadDetail;
  compose?: "case";
  fromAddress: string;
  onChanged: (thread: MailThreadDetail) => void;
}

function firstName(name: string) {
  return name.split(" ")[0];
}

/** One email thread: patient link, the messages, and the doctor's reply. */
export function ThreadPanel({ thread, compose, fromAddress, onChanged }: ThreadPanelProps) {
  const patient = thread.patient;
  const caseRequest = caseRequestText(firstName(patient?.full_name ?? thread.contact_name ?? ""), patient?.file_number ?? "(your file number)");
  const [draft, setDraft] = useState(compose === "case" ? caseRequest : "");
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Patient[]>([]);
  const [pick, setPick] = useState(thread.suggested_patient?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    documentsApi.list(patient.id).then((list) => !cancelled && setDocuments(list), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [patient]);

  useEffect(() => {
    if (patient || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      patientsApi.list({ q: query.trim(), page_size: 8 }).then((page) => !cancelled && setMatches(page.results), () => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, patient]);

  async function run(action: () => Promise<MailThreadDetail>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
      return true;
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "Only the doctor can send from the clinic mailbox." : apiErrorMessage(err, "Could not do that."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const options = [
    ...(thread.suggested_patient ? [thread.suggested_patient] : []),
    ...matches.filter((m) => m.id !== thread.suggested_patient?.id),
  ];

  return (
    <Panel aria-labelledby="th" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start gap-3 border-b border-line-soft pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="th" className="m-0 text-xl font-semibold" dir="auto">{thread.subject || "(no subject)"}</h2>
          <span className="text-[13px] text-muted">
            {thread.contact_name ? `${thread.contact_name} · ` : ""}
            <span className="font-emr-mono">{thread.contact_email}</span>
          </span>
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          {patient ? (
            <Link
              href={`${emrRoutes.docs}?patient=${encodeURIComponent(patient.file_number)}`}
              className="inline-flex min-h-[38px] flex-none items-center rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink no-underline"
            >
              Open file
            </Link>
          ) : null}
          <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => void run(() => mailApi.threads.state(thread.id, { archived: !thread.archived }))}>
            {thread.archived ? "Move to inbox" : "Archive"}
          </ActionButton>
        </div>
      </div>

      {patient ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Filed in
          <Pill tone="brand" size="sm">{patient.full_name} · {patient.file_number}</Pill>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => mailApi.threads.link(thread.id, null))}
            className="ms-auto cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-ink-2"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-warn-wash px-4 py-3 text-[13px] text-[#5a3d00]">
          {thread.suggested_patient ? (
            <span>
              This address isn&apos;t in any file. The email mentions <strong>{thread.suggested_patient.full_name}</strong>.
            </span>
          ) : (
            <span>Not filed with a patient. Link it if this email belongs in a file.</span>
          )}
          <input
            aria-label="Find patient"
            placeholder="Find patient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ms-auto min-h-9 rounded-[14px] border border-field bg-white px-3 text-[13px]"
          />
          <SelectInput aria-label="Patient" value={pick} onChange={(e) => setPick(e.target.value)} className="min-h-9 w-auto min-w-[200px] text-[13px]">
            <option value="">Choose patient…</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.file_number}</option>)}
          </SelectInput>
          <ActionButton size="sm" onClick={() => void run(() => mailApi.threads.link(thread.id, pick))} disabled={!pick || busy}>
            Link to file
          </ActionButton>
        </div>
      )}

      <ol className="m-0 flex flex-1 list-none flex-col gap-3.5 p-0">
        {thread.messages.map((m) => <MessageBubble key={m.id} message={m} fileNumber={patient?.file_number} />)}
      </ol>

      <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-canvas-2 p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Templates:
          <button
            type="button"
            onClick={() => setDraft(caseRequest)}
            className="min-h-[34px] cursor-pointer rounded-full border border-brand bg-white px-3 text-xs font-semibold text-brand"
          >
            Request case by email
          </button>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Reply
          <TextArea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className="resize-y leading-[1.7]" dir="auto" />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {patient && documents.length ? (
            <>
              Attach from file:
              {documents.slice(0, 6).map((d) => {
                const on = attached.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAttached((a) => (on ? a.filter((x) => x !== d.id) : [...a, d.id]))}
                    className={cn(
                      "min-h-[34px] cursor-pointer rounded-full border px-3 text-xs",
                      on ? "border-brand bg-brand-tint font-semibold text-brand-ink" : "border-field bg-white text-ink",
                    )}
                  >
                    {on ? "✓ " : ""}
                    {d.title}
                  </button>
                );
              })}
            </>
          ) : null}
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={async () => {
              if (await run(() => mailApi.threads.reply(thread.id, draft, attached))) {
                setDraft("");
                setAttached([]);
              }
            }}
            className="ms-auto min-h-11 cursor-pointer rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error ? <p role="alert" className="m-0 text-xs text-danger-ink">{error}</p> : null}
        <span className="text-xs text-muted">
          Sent from <span className="font-emr-mono">{fromAddress}</span>. Replies come back to this thread. Results
          emails are sent from the results review queue, not from here.
        </span>
      </div>
    </Panel>
  );
}
