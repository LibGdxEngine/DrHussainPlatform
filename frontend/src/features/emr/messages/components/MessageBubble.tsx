"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { docSlots, type SlotId } from "@/features/emr/documents/data";
import { emrRoutes } from "@/features/emr/routes";
import { SelectInput } from "@/features/emr/ui/Fields";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { mailApi, type MailMessage } from "@/lib/api/emr/mail";

type Attachment = MailMessage["attachments"][number];

async function openAttachment(attachment: Attachment) {
  const blob = await mailApi.attachments.file(attachment.id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A received file: open it, or save it into the patient's documents (lab reports are then read). */
function IncomingAttachment({ attachment, fileNumber }: { attachment: Attachment; fileNumber?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(Boolean(attachment.saved_document));
  const [slot, setSlot] = useState<SlotId>("lab");
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <Link
        href={fileNumber ? `${emrRoutes.docs}?patient=${encodeURIComponent(fileNumber)}` : emrRoutes.docs}
        className="inline-flex items-center gap-1.5 rounded-full border border-ok-tint bg-ok-tint px-3 py-1 text-xs font-semibold text-ok-ink no-underline"
      >
        ✓ {attachment.filename} · in the patient&apos;s file
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void openAttachment(attachment)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-field bg-white px-3 py-1 text-xs font-semibold text-ink"
        >
          📎 {attachment.filename}
        </button>
        {fileNumber ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-brand"
          >
            Save to file
          </button>
        ) : null}
      </span>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas p-2.5">
          <SelectInput aria-label="Category" value={slot} onChange={(e) => setSlot(e.target.value as SlotId)} className="min-h-9 w-auto text-xs">
            {docSlots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
          <button
            type="button"
            onClick={() =>
              mailApi.attachments.save(attachment.id, slot).then(
                () => setSaved(true),
                (err: unknown) => setError(apiErrorMessage(err, "Could not save the file.")),
              )
            }
            className="min-h-9 cursor-pointer rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-ink"
          >
            Save
          </button>
          {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** One email in a thread: sent ones on the right, received ones on the left. */
export function MessageBubble({ message, fileNumber }: { message: MailMessage; fileNumber?: string }) {
  const sent = message.direction === "out";
  const when = new Date(message.sent_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <li
      className={cn(
        "flex max-w-[78%] flex-col gap-1.5 rounded-[20px] border px-4 py-3.5",
        sent ? "self-end border-brand-tint bg-brand-tint" : "self-start border-field bg-white",
      )}
    >
      <span className="text-xs text-muted">
        {sent
          ? `${message.sent_by_name || "Clinic"} → ${message.to_addresses.join(", ")}`
          : `${message.from_name || message.from_address}`}{" "}
        · {when}
        {message.status === "queued" ? " · sending…" : message.status === "failed" ? ` · not sent (${message.error})` : ""}
      </span>
      <span className="whitespace-pre-wrap text-sm leading-[1.8]" dir="auto">{message.body_text}</span>
      {sent && message.attachment_names.length ? (
        <div className="flex flex-wrap gap-1.5">
          {message.attachment_names.map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-field bg-white px-3 py-1 text-xs font-semibold text-ink">
              📎 {name}
            </span>
          ))}
        </div>
      ) : null}
      {!sent && message.attachments.length ? (
        <div className="flex flex-wrap gap-1.5">
          {message.attachments.map((a) => <IncomingAttachment key={a.id} attachment={a} fileNumber={fileNumber} />)}
        </div>
      ) : null}
    </li>
  );
}
