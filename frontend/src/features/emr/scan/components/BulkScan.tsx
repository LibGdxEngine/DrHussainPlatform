"use client";

import { useState } from "react";
import { DropZone } from "@/features/emr/documents/components/DropZone";
import { formatBytes } from "@/features/emr/format";
import { ActionButton } from "@/features/emr/ui/Action";
import { SelectInput, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { Table, Td, Th } from "@/features/emr/ui/Table";
import {
  bulkRowState, bulkState, newScanFile, scanSlots, type BulkRow, type ScanFile, type ScanPatient,
} from "../data";
import { saveScan } from "../save";
import { PatientPicker } from "./PatientPicker";

const columns = ["", "File", "Name", "Patient", "Category", "Date", "Status"];

/** Doctor's old paper files: choose many scans, assign each to a patient and category, then save. */
export function BulkScan() {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const savedCount = rows.filter((r) => r.status === "saved").length;
  const toSave = rows.filter((r) => ["ready", "error"].includes(bulkRowState(r)));
  const selectedKeys = rows.filter((r) => selected[r.key] && r.status !== "saved").map((r) => r.key);
  const pct = rows.length ? Math.round((savedCount / rows.length) * 100) : 0;

  const update = (key: string, patch: Partial<BulkRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch, status: r.status === "error" ? "idle" : r.status } : r)));

  function assignSelected(patient: ScanPatient) {
    setRows((list) => list.map((r) => (selectedKeys.includes(r.key) ? { ...r, patient, status: r.status === "error" ? "idle" : r.status } : r)));
    setSelected({});
  }

  async function saveReady() {
    setSaving(true);
    for (const row of toSave) {
      if (!row.patient) continue;
      setRows((list) => list.map((r) => (r.key === row.key ? { ...r, status: "saving" } : r)));
      const result = await saveScan(row, row.patient.id, "bulk_scan");
      setRows((list) => list.map((r) => (r.key === row.key ? result : r)));
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel aria-labelledby="bp" className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="bp" className="m-0 text-lg font-semibold">Doctor&apos;s old files</h2>
          {rows.length ? (
            <span className="text-sm text-muted">
              {savedCount} of {rows.length} {rows.length === 1 ? "file" : "files"} saved
            </span>
          ) : null}
        </div>
        {rows.length ? (
          <div className="h-2.5 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-label="Files saved" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Scan each patient&apos;s papers, then choose the files here. Pick the patient and category for each file, or select several files and assign them at once.
        </p>
        <DropZone
          onFiles={(files) => setRows((list) => [...list, ...files.map((file) => ({ ...newScanFile(file, ""), patient: null }))])}
          busy={saving}
          hint="PDF, JPG or PNG. As many files as you like."
        />
      </Panel>

      {rows.length ? (
        <Panel aria-label="Bulk scan list" className="overflow-hidden">
          <div className="flex flex-wrap items-start gap-2.5 p-5">
            <span className="self-center text-[13px] text-muted">{selectedKeys.length} selected</span>
            {selectedKeys.length ? (
              <PatientPicker
                label="Assign selected files to a patient"
                placeholder="Assign selected to…"
                className="w-[260px]"
                compact
                onPick={assignSelected}
              />
            ) : null}
            <ActionButton size="sm" className="ms-auto" disabled={saving || toSave.length === 0} onClick={() => void saveReady()}>
              {saving ? "Saving…" : `Save assigned files${toSave.length ? ` (${toSave.length})` : ""}`}
            </ActionButton>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <Th key={i} tinted>{c}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const state = bulkState[bulkRowState(r)];
                  const locked = saving || r.status === "saved";
                  return (
                    <tr key={r.key} className="align-top">
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.file.name}`}
                          disabled={locked}
                          checked={!!selected[r.key]}
                          onChange={() => setSelected((s) => ({ ...s, [r.key]: !s[r.key] }))}
                          className="size-[17px] accent-brand"
                        />
                      </Td>
                      <Td>
                        <span className="font-emr-mono text-xs">{r.file.name}</span>
                        <div className="text-xs text-muted">{formatBytes(r.file.size)}</div>
                        {!locked ? (
                          <button
                            type="button"
                            onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                            className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-muted hover:text-ink"
                          >
                            Remove
                          </button>
                        ) : null}
                      </Td>
                      <Td>
                        <TextInput
                          aria-label={`Name for ${r.file.name}`}
                          disabled={locked}
                          value={r.title}
                          maxLength={255}
                          onChange={(e) => update(r.key, { title: e.target.value })}
                          className="min-h-9 min-w-[150px] text-[13px]"
                        />
                      </Td>
                      <Td className="min-w-[200px]">
                        {r.patient ? (
                          <div className="flex flex-col gap-0.5 text-[13px]">
                            <strong className="font-semibold">{r.patient.full_name}</strong>
                            <span className="font-emr-mono text-[11px] text-muted">{r.patient.file_number}</span>
                            {!locked ? (
                              <button
                                type="button"
                                onClick={() => update(r.key, { patient: null })}
                                className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs font-semibold text-brand"
                              >
                                Change
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <PatientPicker
                            label={`Patient for ${r.file.name}`}
                            compact
                            onPick={(patient) => update(r.key, { patient })}
                          />
                        )}
                      </Td>
                      <Td>
                        <SelectInput
                          aria-label={`Category for ${r.file.name}`}
                          disabled={locked}
                          value={r.slot}
                          onChange={(e) => update(r.key, { slot: e.target.value as ScanFile["slot"] })}
                          className="min-h-9 min-w-[140px] text-[13px]"
                        >
                          <option value="">— Select —</option>
                          {scanSlots.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </SelectInput>
                      </Td>
                      <Td>
                        <TextInput
                          type="date"
                          aria-label={`Date of ${r.file.name}`}
                          disabled={locked}
                          value={r.date}
                          onChange={(e) => update(r.key, { date: e.target.value })}
                          className="min-h-9 w-[150px] text-[13px]"
                        />
                      </Td>
                      <Td>
                        <Pill tone={state.tone} size="xs">{state.label}</Pill>
                        {r.status === "error" && r.message ? (
                          <p role="alert" className="m-0 mt-1 max-w-[220px] text-xs text-danger-ink">{r.message}</p>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
