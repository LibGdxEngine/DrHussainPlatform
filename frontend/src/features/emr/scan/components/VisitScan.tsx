"use client";

import { useEffect, useState } from "react";
import { DropZone } from "@/features/emr/documents/components/DropZone";
import { emrRoutes } from "@/features/emr/routes";
import { usePatientByFileNumber } from "@/features/emr/shell/usePatientByFileNumber";
import { ActionButton, ActionLink } from "@/features/emr/ui/Action";
import { Field, SelectInput, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { formatBytes } from "@/features/emr/format";
import { cn } from "@/lib/utils";
import { appointmentsApi, type Appointment } from "@/lib/api/emr/appointments";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { localDay, newScanFile, scanQueue, scanSlots, type ScanFile, type ScanPatient } from "../data";
import { saveScan } from "../save";
import { PatientPicker } from "./PatientPicker";
import { RequestedTestsPanel } from "./RequestedTestsPanel";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Reception flow: patient → choose files → name and file each one → save to the patient's record. */
export function VisitScan({ initialFileNumber }: { initialFileNumber?: string }) {
  const linked = usePatientByFileNumber(initialFileNumber);
  const [chosen, setChosen] = useState<ScanPatient | null>(null);
  const [queue, setQueue] = useState<Appointment[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    appointmentsApi.list({ date: localDay(new Date()) }, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setQueue(scanQueue(list));
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setQueueError(apiErrorMessage(err, "Could not load today's schedule."));
      },
    );
    return () => controller.abort();
  }, []);

  const patient = chosen ?? linked.patient ?? null;

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      <Panel aria-labelledby="sq" className="flex flex-col gap-1 p-4">
        <h2 id="sq" className="m-0 mb-2 px-2 text-base font-semibold">Files to scan today</h2>
        {queueError ? (
          <p role="alert" className="m-0 px-2 text-[13px] text-danger-ink">{queueError}</p>
        ) : queue === null ? (
          <p className="m-0 px-2 text-[13px] text-muted">Loading today&apos;s schedule…</p>
        ) : queue.length === 0 ? (
          <p className="m-0 px-2 text-[13px] text-muted">No visits today bring files to scan.</p>
        ) : (
          queue.map((a) => {
            const on = a.patient.id === patient?.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => setChosen({ id: a.patient.id, file_number: a.patient.file_number, full_name: a.patient.full_name })}
                className={cn(
                  "flex min-h-14 cursor-pointer flex-col items-start gap-0.5 rounded-xl border-0 px-3 py-2 text-start",
                  on ? "bg-brand-tint text-brand-ink" : "bg-transparent text-ink-2 hover:bg-canvas",
                )}
              >
                <span className="text-sm font-semibold">
                  {timeFormat.format(new Date(a.starts_at))} · {a.patient.full_name}
                </span>
                <span className="text-xs text-muted">
                  {a.kind_label} · {a.status === "checked_in" ? "checked in" : "not yet arrived"}
                </span>
              </button>
            );
          })
        )}
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line-soft px-1 pt-3">
          <span className="text-[13px] font-medium text-ink-2">Or search any patient</span>
          <PatientPicker label="Search patients" onPick={setChosen} />
        </div>
        {initialFileNumber && linked.message && !chosen ? (
          <p role="alert" className="m-0 mt-2 px-2 text-[13px] text-danger-ink">{linked.message}</p>
        ) : null}
      </Panel>

      {patient ? (
        <PatientScan key={patient.id} patient={patient} />
      ) : (
        <Panel className="flex flex-col gap-1 p-5 xl:col-span-2">
          <h2 className="m-0 text-lg font-semibold">
            {initialFileNumber && !linked.message && !linked.patient ? "Opening the file…" : "Choose a patient"}
          </h2>
          <span className="text-[13px] text-muted">Pick a visit from today&apos;s list or search for the patient whose papers you are scanning.</span>
        </Panel>
      )}
    </div>
  );
}

/** Files and requested tests for one patient; remounted when the patient changes. */
function PatientScan({ patient }: { patient: ScanPatient }) {
  const [files, setFiles] = useState<ScanFile[]>([]);
  const [saving, setSaving] = useState(false);

  const unsaved = files.filter((f) => f.status !== "saved");
  const saved = files.filter((f) => f.status === "saved");
  const update = (key: string, patch: Partial<ScanFile>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...patch, status: f.status === "error" ? "idle" : f.status } : f)));

  async function saveAll() {
    setSaving(true);
    for (const row of files.filter((f) => f.status !== "saved")) {
      setFiles((list) => list.map((f) => (f.key === row.key ? { ...f, status: "saving" } : f)));
      const result = await saveScan(row, patient.id, "clinic_scan");
      setFiles((list) => list.map((f) => (f.key === row.key ? result : f)));
    }
    setSaving(false);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <DropZone
          onFiles={(chosen) => setFiles((list) => [...list, ...chosen.map((file) => newScanFile(file, "lab"))])}
          busy={saving}
          hint="PDF, JPG or PNG. Name each file and choose its category below."
        />
        <Panel aria-labelledby="sp" className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sp" className="m-0 text-lg font-semibold">{patient.full_name}</h2>
            <span className="font-emr-mono text-xs text-muted">{patient.file_number}</span>
            <ActionLink
              href={`${emrRoutes.docs}?patient=${encodeURIComponent(patient.file_number)}`}
              variant="quiet"
              size="sm"
              className="ms-auto"
            >
              Open documents
            </ActionLink>
          </div>
          {files.length === 0 ? (
            <p className="m-0 rounded-2xl bg-canvas px-4 py-6 text-center text-[13px] text-muted">
              No files yet. Scan the papers, then drop the files above or click to choose them.
            </p>
          ) : (
            files.map((f) => {
              // Every row is locked while saving, so what is uploaded is what is on screen.
              const locked = saving || f.status === "saved";
              return (
                <div key={f.key} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-emr-mono">{f.file.name}</span>
                    <span>· {formatBytes(f.file.size)}</span>
                    {f.status === "saved" ? <Pill tone="ok" size="xs">✓ Saved</Pill> : null}
                    {f.status === "saving" ? <Pill tone="neutral" size="xs">Saving…</Pill> : null}
                    {!locked ? (
                      <button
                        type="button"
                        onClick={() => setFiles((list) => list.filter((x) => x.key !== f.key))}
                        className="ms-auto cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-muted hover:text-ink"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 items-end gap-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="File name">
                      <TextInput value={f.title} disabled={locked} maxLength={255} onChange={(e) => update(f.key, { title: e.target.value })} />
                    </Field>
                    <Field label="Category">
                      <SelectInput
                        value={f.slot}
                        disabled={locked}
                        onChange={(e) => update(f.key, { slot: e.target.value as ScanFile["slot"] })}
                      >
                        {scanSlots.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Test date">
                      <TextInput type="date" value={f.date} disabled={locked} onChange={(e) => update(f.key, { date: e.target.value })} />
                    </Field>
                  </div>
                  {f.status === "error" && f.message ? (
                    <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">{f.message}</p>
                  ) : null}
                </div>
              );
            })
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <ActionButton disabled={unsaved.length === 0 || saving} onClick={() => void saveAll()} className="px-[22px]">
              {saving ? "Saving…" : `Save to patient file${unsaved.length ? ` (${unsaved.length})` : ""}`}
            </ActionButton>
            <span role="status">
              {saved.length ? (
                <Pill tone="ok" size="md">
                  ✓ {saved.length} {saved.length === 1 ? "file" : "files"} saved
                </Pill>
              ) : null}
            </span>
          </div>
          <p className="m-0 text-xs text-muted">
            Reception only scans and names files. Key values and medical notes are entered by the doctor.
          </p>
        </Panel>
      </div>

      <RequestedTestsPanel
        patient={patient}
        uploads={saved.map((f) => ({ id: f.document ?? "", title: f.title })).filter((d) => d.id)}
      />
    </>
  );
}
