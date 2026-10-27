"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBytes, formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton, ActionLink } from "@/features/emr/ui/Action";
import { Field, SelectInput, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { documentsApi, type DocumentSource, type PatientDocument } from "@/lib/api/emr/documents";
import type { Patient } from "@/lib/api/emr/patients";
import { ResultsPanel } from "@/features/emr/results/components/ResultsPanel";
import { docSlots, type SlotId } from "../data";
import { DocumentPreview } from "./DocumentPreview";
import { DropZone } from "./DropZone";
import { SlotButton } from "./SlotButton";

const sources: { id: DocumentSource; label: string }[] = [
  { id: "upload", label: "Uploaded" },
  { id: "clinic_scan", label: "Scanned at clinic" },
  { id: "patient", label: "Brought in by patient" },
  { id: "email", label: "By email" },
  { id: "bulk_scan", label: "Doctor's old files" },
];
const sourceLabel = Object.fromEntries(sources.map((s) => [s.id, s.label])) as Record<DocumentSource, string>;

async function saveBlob(document: PatientDocument) {
  const blob = await documentsApi.file(document.id, true);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = document.original_filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DocumentsWorkspace({ patient }: { patient: Patient }) {
  const [slot, setSlot] = useState<SlotId>("lab");
  const [documents, setDocuments] = useState<PatientDocument[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const reload = useCallback(
    () =>
      documentsApi.list(patient.id).then((page) => setDocuments(page.results), (err: unknown) => {
        setNotice({ tone: "error", text: apiErrorMessage(err, "Could not load the documents.") });
      }),
    [patient.id],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const inSlot = useMemo(() => (documents ?? []).filter((d) => d.slot === slot), [documents, slot]);
  const counts = useMemo(() => {
    const totals: Partial<Record<SlotId, number>> = {};
    for (const d of documents ?? []) totals[d.slot] = (totals[d.slot] ?? 0) + 1;
    return totals;
  }, [documents]);
  const selected = inSlot.find((d) => d.id === selectedId) ?? inSlot[0] ?? null;
  const slotName = docSlots.find((s) => s.id === slot)?.name ?? "";

  async function upload(files: File[]) {
    setUploading(true);
    setNotice(null);
    const failures: string[] = [];
    let last: PatientDocument | null = null;
    for (const file of files) {
      try {
        last = await documentsApi.upload({ patient: patient.id, slot, file });
      } catch (err) {
        failures.push(`${file.name}: ${apiErrorMessage(err, "upload failed")}`);
      }
    }
    await reload();
    if (last) setSelectedId(last.id);
    setUploading(false);
    const saved = files.length - failures.length;
    setNotice(failures.length
      ? { tone: "error", text: [saved ? `${saved} saved.` : "", ...failures].filter(Boolean).join(" ") }
      : { tone: "ok", text: `${saved} ${saved === 1 ? "file" : "files"} saved to ${slotName}. Add the report date below.` });
  }

  async function update(document: PatientDocument, changes: Partial<PatientDocument>) {
    try {
      const saved = await documentsApi.update(document.id, {
        title: changes.title,
        slot: changes.slot,
        document_date: changes.document_date,
        source: changes.source,
      });
      setDocuments((prev) => (prev ?? []).map((d) => (d.id === saved.id ? saved : d)));
      if (saved.slot !== slot) setSlot(saved.slot);
      setSelectedId(saved.id);
      setNotice({ tone: "ok", text: "Details saved." });
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorMessage(err, "Could not save the details.") });
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
      <Panel aria-labelledby="slt" className="flex flex-col gap-1 p-4">
        <h2 id="slt" className="m-0 mb-2 px-2 text-base font-semibold">Categories</h2>
        {docSlots.map((s) => (
          <SlotButton
            key={s.id}
            name={s.name}
            count={documents ? String(counts[s.id] ?? 0) : "…"}
            active={s.id === slot}
            onPick={() => {
              setSlot(s.id);
              setSelectedId(null);
            }}
          />
        ))}
        <ActionLink href={`${emrRoutes.scan}?patient=${encodeURIComponent(patient.file_number)}`} className="mt-2.5">
          + Scan / upload
        </ActionLink>
      </Panel>

      <div className="flex flex-col gap-4">
        <DropZone onFiles={(files) => void upload(files)} busy={uploading} hint={`PDF, JPG or PNG, saved to ${slotName}.`} />
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "m-0 rounded-xl px-3 py-2.5 text-[13px]",
              notice.tone === "error" ? "bg-danger-tint text-danger-ink" : "bg-ok-tint text-ok-ink",
            )}
          >
            {notice.text}
          </p>
        ) : null}
        {inSlot.length > 1 ? (
          <Panel aria-label={`${slotName} files`} className="flex flex-col gap-1 p-3">
            {inSlot.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={d.id === selected?.id}
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border-0 px-3 text-start text-sm",
                  d.id === selected?.id ? "bg-brand-tint font-semibold text-brand-ink" : "bg-transparent text-ink-2 hover:bg-canvas",
                )}
              >
                {d.title}
                <span className="ms-auto text-xs font-normal text-muted">{formatDay(d.document_date)}</span>
              </button>
            ))}
          </Panel>
        ) : null}
        {selected ? (
          <DocumentDetails key={selected.id} document={selected} onSave={(changes) => update(selected, changes)} />
        ) : (
          <Panel className="flex flex-col gap-1 p-5">
            <h2 className="m-0 text-lg font-semibold">{documents ? `No ${slotName.toLowerCase()} yet` : "Loading…"}</h2>
            <span className="text-[13px] text-muted">Drop a file above to add it to this category.</span>
          </Panel>
        )}
      </div>

      {selected ? (
        // Keyed on the category too: moving a file into lab results queues it to be read.
        <ResultsPanel key={`${selected.id}-${selected.slot}`} document={selected} />
      ) : (
        <Panel className="flex flex-col gap-1 p-5">
          <h2 className="m-0 text-lg font-semibold">Results from this file</h2>
          <span className="text-[13px] text-muted">Choose or upload a file to see its results.</span>
        </Panel>
      )}
    </div>
  );
}

interface DocumentDetailsProps {
  document: PatientDocument;
  onSave: (changes: Partial<PatientDocument>) => Promise<void>;
}

/** Preview plus the editable name, category, date and origin of one file. */
function DocumentDetails({ document, onSave }: DocumentDetailsProps) {
  const [title, setTitle] = useState(document.title);
  const [date, setDate] = useState(document.document_date ?? "");
  const [slot, setSlot] = useState(document.slot);
  const [source, setSource] = useState<DocumentSource>(document.source ?? "upload");
  const [saving, setSaving] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const dirty = title !== document.title || date !== (document.document_date ?? "")
    || slot !== document.slot || source !== (document.source ?? "upload");

  return (
    <Panel aria-labelledby="dl" className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="dl" className="m-0 text-lg font-semibold">{document.title}</h2>
        <span className="text-[13px] text-muted">
          {document.document_date ? `Report date ${formatDay(document.document_date)} · ` : "No report date yet · "}
          added {formatDay(document.created_at)}
          {document.uploaded_by_name ? ` by ${document.uploaded_by_name}` : ""} · {formatBytes(document.size)}
        </span>
        <Pill tone="brand" size="xs" className="self-start">
          {sourceLabel[document.source ?? "upload"]}
        </Pill>
      </div>
      <DocumentPreview document={document} />
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ title: title.trim() || document.title, document_date: date || null, slot, source });
          setSaving(false);
        }}
      >
        <Field label="Name" className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
        </Field>
        <Field label="Report date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Category">
          <SelectInput value={slot} onChange={(e) => setSlot(e.target.value as SlotId)}>
            {docSlots.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="How it reached the clinic" className="sm:col-span-2">
          <SelectInput value={source} onChange={(e) => setSource(e.target.value as DocumentSource)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <ActionButton type="submit" size="sm" className="px-4" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save details"}
          </ActionButton>
          <ActionButton
            variant="quiet"
            size="sm"
            className="px-4"
            onClick={() => {
              setDownloadError(null);
              saveBlob(document).catch((err: unknown) => setDownloadError(apiErrorMessage(err, "Download failed.")));
            }}
          >
            Download
          </ActionButton>
          {downloadError ? <span className="text-xs text-danger-ink">{downloadError}</span> : null}
        </div>
      </form>
    </Panel>
  );
}
