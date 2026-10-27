"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/features/emr/ui/Action";
import { Field, SelectInput, TextArea, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { diagnosesApi, type Diagnosis, type DiagnosisStatus } from "@/lib/api/emr/diagnoses";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import type { Patient } from "@/lib/api/emr/patients";

const statuses: { value: DiagnosisStatus; label: string }[] = [
  { value: "suspected", label: "Suspected" }, { value: "confirmed", label: "Confirmed" },
  { value: "resolved", label: "Resolved" }, { value: "ruled_out", label: "Ruled out" },
];
const statusLabel = (status: DiagnosisStatus) => statuses.find((item) => item.value === status)?.label ?? status;
const timestamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Draft = { name: string; status: DiagnosisStatus; noted_on: string; notes: string };
const emptyDraft: Draft = { name: "", status: "suspected", noted_on: "", notes: "" };

export function DiagnosesWorkspace({ patient }: { patient: Patient }) {
  const [records, setRecords] = useState<Diagnosis[] | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    let cancelled = false;
    diagnosesApi.list(patient.id).then((items) => { if (!cancelled) setRecords(items); })
      .catch((err: unknown) => { if (!cancelled) setError(apiErrorMessage(err, "Could not load diagnoses.")); });
    return () => { cancelled = true; };
  }, [patient.id]);

  async function reload() {
    setBusy(true);
    try {
      setRecords(await diagnosesApi.list(patient.id));
      setEditing(null);
      setDraft(emptyDraft);
      setConflict(false);
      setError(null);
      setNotice("Diagnoses reloaded.");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reload diagnoses."));
    } finally { setBusy(false); }
  }

  function edit(record: Diagnosis) {
    setEditing(record);
    setDraft({ name: record.name, status: record.status, noted_on: record.noted_on ?? "", notes: record.notes ?? "" });
    setError(null);
    setNotice(null);
    setConflict(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) { setError("Enter a diagnosis."); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fields = { ...draft, name: draft.name.trim(), noted_on: draft.noted_on || null };
      const saved = editing ? await diagnosesApi.update(editing.id, editing.version, fields) : await diagnosesApi.create(patient.id, fields);
      setRecords((previous) => [saved, ...(previous ?? []).filter((record) => record.id !== saved.id)]);
      setDraft(emptyDraft);
      setEditing(null);
      setConflict(false);
      setNotice("Diagnosis saved.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "DIAGNOSIS_CONFLICT") setConflict(true);
      setError(apiErrorMessage(err, "Could not save the diagnosis."));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel className="flex flex-col gap-4 p-5">
        <div><h2 className="m-0 text-lg font-semibold">{editing ? "Edit diagnosis" : "Add diagnosis"}</h2>
          <p className="mb-0 text-sm text-muted">Enter a diagnosis in your own words. Each save keeps a history.</p></div>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field label="Diagnosis"><TextInput required maxLength={255} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Status"><SelectInput value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as DiagnosisStatus })}>
            {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </SelectInput></Field>
          <Field label="Date noted (optional)"><TextInput type="date" value={draft.noted_on} onChange={(e) => setDraft({ ...draft, noted_on: e.target.value })} /></Field>
          <Field label="Clinical notes (optional)"><TextArea rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
          {error ? <p role="alert" className="m-0 text-sm text-danger-ink">{error}</p> : null}
          {notice ? <p role="status" className="m-0 text-sm text-ok-ink">{notice}</p> : null}
          <div className="flex flex-wrap gap-2">
            <ActionButton type="submit" size="sm" disabled={busy || records === null || conflict}>{busy ? "Saving…" : editing ? "Save changes" : "Add diagnosis"}</ActionButton>
            {editing ? <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyDraft); setConflict(false); setError(null); }}>Cancel edit</ActionButton> : null}
            {conflict || (error && records === null) ? <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => void reload()}>Reload diagnoses</ActionButton> : null}
          </div>
          {conflict ? <p className="m-0 text-xs text-muted">Reloading discards this draft. Copy your changes first if needed.</p> : null}
        </form>
      </Panel>
      <Panel className="flex flex-col gap-3 p-5" aria-label="Patient diagnoses">
        <h2 className="m-0 text-lg font-semibold">Patient diagnoses</h2>
        {records === null ? <p className="m-0 text-sm text-muted">{error ? "Diagnoses unavailable." : "Loading diagnoses…"}</p> : null}
        {records?.length === 0 ? <p className="m-0 text-sm text-muted">No diagnoses recorded yet.</p> : null}
        {records?.map((record) => (
          <article key={record.id} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-start gap-2"><h3 className="m-0 text-base font-semibold">{record.name}</h3>
              <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand-ink">{statusLabel(record.status)}</span>
              <ActionButton variant="quiet" size="sm" className="ms-auto" disabled={busy} onClick={() => edit(record)}>Edit</ActionButton></div>
            <p className="my-2 text-xs text-muted">{record.noted_on ? `Date noted: ${record.noted_on}` : "No date noted"}</p>
            {record.notes ? <p className="whitespace-pre-wrap text-sm">{record.notes}</p> : null}
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">History ({record.revisions.length})</summary>
              <ol className="mt-3 flex list-none flex-col gap-3 p-0">{record.revisions.map((revision) => (
                <li key={revision.number} className="rounded-xl bg-canvas p-3">
                  <p className="m-0 text-xs text-muted">Version {revision.number} · {timestamp(revision.created_at)} · {revision.author_name || "Unknown author"}</p>
                  <p className="mb-1 mt-2 font-semibold">{revision.name} · {statusLabel(revision.status)}</p>
                  <p className="m-0 text-xs text-muted">{revision.noted_on ? `Date noted: ${revision.noted_on}` : "No date noted"}</p>
                  {revision.notes ? <p className="mb-0 whitespace-pre-wrap">{revision.notes}</p> : null}
                </li>))}</ol></details>
          </article>
        ))}
      </Panel>
    </div>
  );
}
