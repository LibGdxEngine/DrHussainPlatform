"use client";

import { useState } from "react";
import { Panel } from "@/features/emr/ui/Panel";
import {
  deriveBlocks, initialMeds, initialTests, labDelivery, medications, rxDelivery, testNames, testSets,
  type MedId,
} from "../data";
import { BlockAlert } from "./BlockAlert";
import { DeliveryFieldset } from "./DeliveryFieldset";
import { MedicationCard } from "./MedicationCard";
import { SentLog } from "./SentLog";
import { TestChip } from "./TestChip";
import { TestSetButton } from "./TestSetButton";

export function OrdersWorkspace() {
  const [tests, setTests] = useState(initialTests);
  const [meds, setMeds] = useState(initialMeds);

  const addSet = (ids: string[]) =>
    setTests((t) => {
      const next = { ...t };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  const toggleTest = (id: string) => setTests((t) => ({ ...t, [id]: !t[id] }));
  const toggleMed = (id: MedId) => setMeds((m) => ({ ...m, [id]: !m[id] }));

  const testIds = Object.keys(tests);
  const blocks = deriveBlocks(meds);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel aria-labelledby="lr" className="flex flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1">
            <h2 id="lr" className="m-0 text-lg font-semibold">Lab, imaging and pathology requests</h2>
            <span className="text-[13px] text-muted">One click adds a full set. Untick any test you don&apos;t need.</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {testSets.map((s) => (
              <TestSetButton
                key={s.name}
                name={s.name}
                count={s.ids.length}
                selected={s.ids.every((id) => tests[id])}
                onAdd={() => addSet(s.ids)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {testIds.map((id) => (
              <TestChip key={id} name={testNames[id]} checked={tests[id]} onToggle={() => toggleTest(id)} />
            ))}
          </div>
          <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
            <strong className="text-ink">{testIds.filter((id) => tests[id]).length} tests selected</strong> · Lp(a) is recorded as done for life once its result is in · For patients still menstruating, the form prints &quot;Take the sample about 7 days before your next period&quot;
          </p>
        </Panel>
        <Panel aria-labelledby="rx" className="flex flex-col gap-2.5 p-5">
          <h2 id="rx" className="m-0 mb-1 text-lg font-semibold">Prescription</h2>
          {medications.map((m) => (
            <MedicationCard key={m.id} med={m} checked={meds[m.id]} onToggle={() => toggleMed(m.id)} />
          ))}
          {blocks.map((b) => (
            <BlockAlert key={b.tag} block={b} />
          ))}
        </Panel>
      </div>
      <div className="flex flex-col gap-4">
        <Panel aria-labelledby="sd" className="flex flex-col gap-3.5 p-5">
          <h2 id="sd" className="m-0 text-lg font-semibold">Send</h2>
          <DeliveryFieldset legend="Lab request" name="lab" options={labDelivery} />
          <DeliveryFieldset legend="Prescription" name="rx" options={rxDelivery} />
          {blocks.length > 0 ? (
            <button
              type="button"
              disabled
              className="min-h-[50px] cursor-not-allowed rounded-full bg-line text-sm font-semibold text-muted"
            >
              Resolve red alerts before sending
            </button>
          ) : (
            <button
              type="button"
              className="min-h-[50px] cursor-pointer rounded-full bg-brand text-sm font-semibold text-white hover:bg-brand-ink"
            >
              Prepare and send
            </button>
          )}
          <span className="text-xs text-muted">Every copy is logged with date, method and recipient.</span>
        </Panel>
        <SentLog />
      </div>
    </div>
  );
}
