"use client";

import { useState } from "react";
import { docSlots, type SlotId } from "../../documents/data";
import { patients } from "../../patients/data";
import { ActionButton } from "../../ui/Action";
import { SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { Table, Td, Th } from "../../ui/Table";
import { BACKLOG_DONE_BEFORE, BACKLOG_TOTAL, bulkStatus, initialBulk, type BulkFile } from "../data";

const columns = ["", "File", "Written on paper", "Patient", "Category", "Date", "Status"];

/** Doctor's backlog of paper files: scan in bulk, then assign each file to a patient and slot. */
export function BulkScan() {
  const [rows, setRows] = useState<BulkFile[]>(initialBulk);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMrn, setBulkMrn] = useState(patients[0].mrn);
  const [filterMrn, setFilterMrn] = useState("");

  const visible = rows.filter((r) => !filterMrn || r.mrn === filterMrn || (filterMrn === "none" && !r.mrn));
  const sorted = BACKLOG_DONE_BEFORE + rows.filter((r) => r.status !== "unsorted").length;
  const pct = Math.round((sorted / BACKLOG_TOTAL) * 100);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const update = (id: string, patch: Partial<BulkFile>) =>
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        return { ...next, status: next.mrn && next.slot ? (next.status === "saved" ? "saved" : "assigned") : "unsorted" };
      }),
    );

  const assignSelected = () => {
    setRows((list) =>
      list.map((r) =>
        selected[r.id] ? { ...r, mrn: bulkMrn, status: r.slot ? "assigned" : "unsorted" } : r,
      ),
    );
    setSelected({});
  };

  const saveAssigned = () =>
    setRows((list) => list.map((r) => (r.status === "assigned" ? { ...r, status: "saved" } : r)));

  const addBatch = () =>
    setRows((list) => [
      ...list,
      ...[1, 2, 3].map((n) => ({
        id: `n${list.length + n}`,
        file: `scan_0${420 + list.length + n}.pdf`,
        pages: n,
        hint: "New batch",
        mrn: "",
        slot: "" as const,
        date: "",
        status: "unsorted" as const,
      })),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <Panel aria-labelledby="bp" className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="bp" className="m-0 text-lg font-semibold">
            Doctor&apos;s old files
          </h2>
          <span className="text-sm text-muted">
            {sorted} of {BACKLOG_TOTAL} files sorted
          </span>
          <ActionButton size="sm" className="ms-auto" onClick={addBatch}>
            + Scan new batch
          </ActionButton>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Feed each patient&apos;s files into the scanner together. After scanning, choose the patient and category for each file, or select several files and assign them at once.
        </p>
      </Panel>

      <Panel aria-label="Bulk scan list" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 p-5">
          <SelectInput
            aria-label="Filter by patient"
            value={filterMrn}
            onChange={(e) => setFilterMrn(e.target.value)}
            className="max-w-[260px]"
          >
            <option value="">All files</option>
            <option value="none">Unsorted only</option>
            {patients.map((p) => (
              <option key={p.mrn} value={p.mrn}>
                {p.name} · {p.mrn}
              </option>
            ))}
          </SelectInput>
          <span className="ms-auto text-[13px] text-muted">{selectedIds.length} selected</span>
          <SelectInput
            aria-label="Patient to assign"
            value={bulkMrn}
            onChange={(e) => setBulkMrn(e.target.value)}
            className="max-w-[240px]"
          >
            {patients.map((p) => (
              <option key={p.mrn} value={p.mrn}>
                {p.name} · {p.mrn}
              </option>
            ))}
          </SelectInput>
          <ActionButton variant="quiet" size="sm" disabled={selectedIds.length === 0} onClick={assignSelected}>
            Assign to patient
          </ActionButton>
          <ActionButton size="sm" onClick={saveAssigned}>
            Save assigned files
          </ActionButton>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <Th key={i} tinted>
                    {c}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = bulkStatus[r.status];
                const locked = r.status === "saved";
                return (
                  <tr key={r.id}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.file}`}
                        disabled={locked}
                        checked={!!selected[r.id]}
                        onChange={() => setSelected((s) => ({ ...s, [r.id]: !s[r.id] }))}
                        className="size-[17px] accent-brand"
                      />
                    </Td>
                    <Td>
                      <span className="font-emr-mono text-xs">
                        {r.file}
                      </span>
                      <div className="text-xs text-muted">{r.pages} {r.pages === 1 ? "page" : "pages"}</div>
                    </Td>
                    <Td className="text-[13px] text-ink-2">{r.hint}</Td>
                    <Td>
                      <SelectInput
                        aria-label="Patient"
                        disabled={locked}
                        value={r.mrn}
                        onChange={(e) => update(r.id, { mrn: e.target.value })}
                        className="min-h-9 min-w-[170px] text-[13px]"
                      >
                        <option value="">— Select —</option>
                        {patients.map((p) => (
                          <option key={p.mrn} value={p.mrn}>
                            {p.name} · {p.mrn}
                          </option>
                        ))}
                      </SelectInput>
                    </Td>
                    <Td>
                      <SelectInput
                        aria-label="Category"
                        disabled={locked}
                        value={r.slot}
                        onChange={(e) => update(r.id, { slot: e.target.value as SlotId })}
                        className="min-h-9 min-w-[140px] text-[13px]"
                      >
                        <option value="">— Select —</option>
                        {docSlots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Td>
                    <Td>
                      <TextInput
                        aria-label="Date"
                        disabled={locked}
                        value={r.date}
                        placeholder="Year / month"
                        onChange={(e) => update(r.id, { date: e.target.value })}
                        className="min-h-9 w-[120px] text-[13px]"
                      />
                    </Td>
                    <Td>
                      {r.status === "unsorted" && r.mrn && !r.slot ? (
                        <Pill tone="amber" size="xs">
                          Needs category
                        </Pill>
                      ) : (
                        <Pill tone={st.tone} size="xs">
                          {st.label}
                        </Pill>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
