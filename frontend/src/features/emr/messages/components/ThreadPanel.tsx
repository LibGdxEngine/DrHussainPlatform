"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { caseRequestText } from "@/features/emr/journey/data";
import { patients } from "@/features/emr/patients/data";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton } from "@/features/emr/ui/Action";
import { SelectInput, TextArea } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import {
  attachmentOptions, initialAttachments, initialDraft, SENT_WHEN,
  type AttachmentId, type EmailThread, type PatientRef,
} from "../data";
import { MessageBubble } from "./MessageBubble";

interface ThreadPanelProps {
  thread: EmailThread;
  compose?: "case";
  fromAddress: string;
  onMatch: (patient: PatientRef | undefined) => void;
  onArchive: () => void;
}

function firstName(name: string) {
  return name.split(" ")[0];
}

/** One email thread from the synced mailbox, with reply, templates and patient linking. */
export function ThreadPanel({ thread, compose, fromAddress, onMatch, onArchive }: ThreadPanelProps) {
  const patient = thread.patient;
  const caseRequest = caseRequestText(firstName(patient?.name ?? thread.contact.name), patient?.mrn ?? "(your file number)");
  const [messages, setMessages] = useState(thread.messages);
  const [draft, setDraft] = useState(
    compose === "case" ? caseRequest : thread.id === "t-laila" ? initialDraft : "",
  );
  const [attached, setAttached] = useState(thread.id === "t-laila" ? initialAttachments : {});
  const [pick, setPick] = useState(thread.suggestion?.mrn ?? "");

  const toggle = (id: AttachmentId) => setAttached((a) => ({ ...a, [id]: !a[id] }));

  const send = () => {
    if (!draft.trim()) return;
    const att = patient ? attachmentOptions.filter((o) => attached[o.id]).map((o) => `${o.name}.pdf`) : [];
    const who = `Dr. Gohar → ${firstName(patient?.name ?? thread.contact.name)}`;
    setMessages((m) => [...m, { from: "doc", who, when: SENT_WHEN, text: draft, att }]);
    setDraft("");
    setAttached({});
  };

  const match = () => {
    const p = patients.find((x) => x.mrn === pick);
    if (p) onMatch({ mrn: p.mrn, name: p.name });
  };

  return (
    <Panel aria-labelledby="th" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start gap-3 border-b border-line-soft pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="th" className="m-0 text-xl font-semibold">
            {thread.subject}
          </h2>
          <span className="text-[13px] text-muted">
            {thread.contact.name} · <span className="font-emr-mono">{thread.contact.email}</span>
          </span>
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          {patient ? (
            <Link
              href={emrRoutes.visit}
              className="inline-flex min-h-[38px] flex-none items-center rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink no-underline"
            >
              Open file
            </Link>
          ) : null}
          {thread.folder !== "archive" ? (
            <ActionButton variant="quiet" size="sm" onClick={onArchive}>
              Archive
            </ActionButton>
          ) : null}
        </div>
      </div>

      {patient ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Linked to
          <Pill tone="brand" size="sm">
            {patient.name} · {patient.mrn}
          </Pill>
          · Logged in her file
          <button
            type="button"
            onClick={() => onMatch(undefined)}
            className="ms-auto cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-ink-2"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-warn-wash px-4 py-3 text-[13px] text-[#5a3d00]">
          {thread.suggestion ? (
            <span>
              This address isn&apos;t in any file. It looks like <strong>{thread.suggestion.name}</strong>.
            </span>
          ) : (
            <span>Not linked to a patient. Link it if this email belongs in a file.</span>
          )}
          <SelectInput
            aria-label="Patient"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="ms-auto min-h-9 w-auto min-w-[200px] text-[13px]"
          >
            <option value="">Choose patient…</option>
            {patients.map((p) => (
              <option key={p.mrn} value={p.mrn}>
                {p.name} · {p.mrn}
              </option>
            ))}
          </SelectInput>
          <ActionButton size="sm" onClick={match} disabled={!pick}>
            Link to file
          </ActionButton>
        </div>
      )}

      {messages.length === 0 ? (
        <p className="m-0 rounded-2xl bg-canvas px-4 py-6 text-center text-[13px] text-muted">
          Draft not sent yet. Write it below.
        </p>
      ) : (
        <ol className="m-0 flex flex-1 list-none flex-col gap-3.5 p-0">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} canFile={!!patient} />
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-canvas-2 p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Templates:
          <button
            type="button"
            onClick={() => {
              setDraft(caseRequest);
              setAttached({});
            }}
            className="min-h-[34px] cursor-pointer rounded-full border border-brand bg-white px-3 text-xs font-semibold text-brand"
          >
            Request case by email
          </button>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Reply
          <TextArea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="resize-y leading-[1.7]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {patient ? (
            <>
              Attach from file:
              {attachmentOptions.map((o) => {
                const on = !!attached[o.id];
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      "min-h-[34px] cursor-pointer rounded-full border px-3 text-xs",
                      on
                        ? "border-brand bg-brand-tint font-semibold text-brand-ink"
                        : "border-field bg-white text-ink",
                    )}
                  >
                    {on ? "✓ " : ""}
                    {o.name}
                  </button>
                );
              })}
            </>
          ) : null}
          <button
            type="button"
            onClick={send}
            className="ms-auto min-h-11 cursor-pointer rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-ink"
          >
            Send
          </button>
        </div>
        <span className="text-xs text-muted">
          Sent from <span className="font-emr-mono">{fromAddress}</span>. Replies come back to this thread
          {patient ? " and are logged in her file; use “Save to file” to file her attachments." : "."}
        </span>
      </div>
    </Panel>
  );
}
