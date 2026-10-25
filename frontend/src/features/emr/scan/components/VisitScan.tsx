"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { docSlots, type SlotId } from "../../documents/data";
import { DropZone } from "../../documents/components/DropZone";
import { requestedFiles, visitLabel, type VisitKey } from "../../journey/data";
import { patients } from "../../patients/data";
import { ActionButton } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { sampleScanNames, scanVisits, todayScanQueue, type ScannedPage } from "../data";

interface VisitScanProps {
  initialMrn?: string;
  initialVisit?: VisitKey;
}

/** Reception flow: patient → visit → scan pages → label each page → save to the patient file. */
export function VisitScan({ initialMrn, initialVisit }: VisitScanProps) {
  const [mrn, setMrn] = useState(initialMrn ?? todayScanQueue[0].mrn);
  const [visit, setVisit] = useState<VisitKey>(initialVisit ?? "v2");
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const patient = patients.find((p) => p.mrn === mrn);
  const checklist = mrn === "VC-000142" ? requestedFiles.filter((f) => f.status === "pending") : [];

  const pick = (nextMrn: string, nextVisit: VisitKey) => {
    setMrn(nextMrn);
    setVisit(nextVisit);
    setPages([]);
    setTicked({});
    setSaved(false);
  };

  const addPage = () => {
    setSaved(false);
    setPages((list) => [
      ...list,
      {
        id: `p${list.length + 1}`,
        name: sampleScanNames[list.length % sampleScanNames.length],
        slot: list.length % 2 === 0 ? "lab" : "us",
        date: "13 Oct 2026",
      },
    ]);
  };

  const update = (id: string, patch: Partial<ScannedPage>) =>
    setPages((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      <Panel aria-labelledby="sq" className="flex flex-col gap-1 p-4">
        <h2 id="sq" className="m-0 mb-2 px-2 text-base font-semibold">
          Checked in today
        </h2>
        {todayScanQueue.map((q) => {
          const on = q.mrn === mrn;
          return (
            <button
              key={q.mrn}
              type="button"
              aria-pressed={on}
              onClick={() => pick(q.mrn, q.visit)}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-start gap-0.5 rounded-xl border-0 px-3 py-2 text-start",
                on ? "bg-brand-tint text-brand-ink" : "bg-transparent text-ink-2 hover:bg-canvas",
              )}
            >
              <span className="text-sm font-semibold">
                {q.time} · {q.name}
              </span>
              <span className="text-xs text-muted">
                {visitLabel[q.visit]} · {q.waiting} {q.waiting === 1 ? "file" : "files"} waiting
              </span>
            </button>
          );
        })}
        <div className="mt-3 flex flex-col gap-3 border-t border-line-soft px-1 pt-3">
          <Field label="Or choose another patient">
            <SelectInput value={mrn} onChange={(e) => pick(e.target.value, visit)}>
              {patients.map((p) => (
                <option key={p.mrn} value={p.mrn}>
                  {p.name} · {p.mrn}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Visit">
            <SelectInput value={visit} onChange={(e) => setVisit(e.target.value as VisitKey)}>
              {scanVisits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <button type="button" onClick={addPage} className="cursor-pointer border-0 bg-transparent p-0 text-start">
          <DropZone />
        </button>
        <Panel aria-labelledby="sp" className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sp" className="m-0 text-lg font-semibold">
              {patient?.name ?? "Patient"} · {visitLabel[visit]}
            </h2>
            <span className="font-emr-mono text-xs text-muted">{mrn}</span>
            <ActionButton variant="quiet" size="sm" className="ms-auto" onClick={addPage}>
              + Scan page
            </ActionButton>
          </div>
          {pages.length === 0 ? (
            <p className="m-0 rounded-2xl bg-canvas px-4 py-6 text-center text-[13px] text-muted">
              No pages yet. Place the papers in the scanner or drag files above.
            </p>
          ) : (
            pages.map((p, i) => (
              <div
                key={p.id}
                className="grid grid-cols-1 items-end gap-2.5 rounded-2xl border border-line p-3 md:grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <span className="flex aspect-[3/4] items-center justify-center rounded-lg bg-canvas text-xs text-subtle">
                  {i + 1}
                </span>
                <Field label="File name">
                  <TextInput value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                </Field>
                <Field label="Category">
                  <SelectInput value={p.slot} onChange={(e) => update(p.id, { slot: e.target.value as SlotId })}>
                    {docSlots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Test date">
                  <TextInput value={p.date} onChange={(e) => update(p.id, { date: e.target.value })} />
                </Field>
              </div>
            ))
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <ActionButton disabled={pages.length === 0} onClick={() => setSaved(true)} className="px-[22px]">
              Save to patient file
            </ActionButton>
            {saved ? (
              <Pill tone="ok" size="md">
                ✓ Saved {pages.length} {pages.length === 1 ? "page" : "pages"} to {visitLabel[visit]}
              </Pill>
            ) : null}
          </div>
          <p className="m-0 text-xs text-muted">
            Reception only scans and names files. Key values and medical notes are entered by the doctor.
          </p>
        </Panel>
      </div>

      <Panel aria-labelledby="sc" className="flex flex-col gap-2 p-5">
        <h2 id="sc" className="m-0 text-base font-semibold">
          Requested by the doctor
        </h2>
        {checklist.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No pending tests for this visit.</p>
        ) : (
          checklist.map((f) => (
            <label key={f.id} className="flex min-h-10 items-center gap-2.5 border-b border-line-soft text-sm">
              <input
                type="checkbox"
                checked={!!ticked[f.id]}
                onChange={() => setTicked((t) => ({ ...t, [f.id]: !t[f.id] }))}
                className="size-[17px] accent-brand"
              />
              {f.name}
              {ticked[f.id] ? (
                <Pill tone="brand" size="xs" className="ms-auto">
                  Arrived
                </Pill>
              ) : null}
            </label>
          ))
        )}
        <p className="m-0 mt-1 text-xs leading-[1.7] text-muted">
          Tick what the patient brought. Anything missing stays visible to the doctor in the visit summary.
        </p>
      </Panel>
    </div>
  );
}
