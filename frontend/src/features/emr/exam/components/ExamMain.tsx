"use client";

import { useMemo, useState } from "react";
import { Field, SelectInput, TextArea, TextInput } from "../../ui/Fields";
import { ChipGroup } from "../../ui/ChipGroup";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import {
  examFindings,
  followUpOptions,
  initialPlan,
  initialVitals,
  nextReview,
  planNotes,
  planOptions,
  type PlanId,
} from "../data";
import { computeVitals, type VitalsInput } from "../vitals";

function ComputedBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
      {label}
      <span className="flex min-h-11 items-center rounded-[14px] bg-brand-tint px-3.5 text-[17px] font-bold text-brand-ink">
        {value}
      </span>
    </div>
  );
}

function VitalsPanel() {
  const [v, setV] = useState<VitalsInput>(initialVitals);
  const result = useMemo(() => computeVitals(v), [v]);
  const bind = (key: keyof VitalsInput) => ({
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Panel aria-labelledby="vt" className="flex flex-col gap-3.5 p-5">
      <h2 id="vt" className="m-0 text-lg font-semibold">
        Vitals
      </h2>
      <div className="grid grid-cols-4 gap-3">
        <Field label="BP · Reading 1">
          <TextInput className="text-[15px]" {...bind("bp1")} />
        </Field>
        <Field label="BP · Reading 2">
          <TextInput className="text-[15px]" {...bind("bp2")} />
        </Field>
        <ComputedBox label="Average" value={result.bpAvg} />
        <div />
        <Field label="Height (cm)">
          <TextInput className="text-[15px]" {...bind("height")} />
        </Field>
        <Field label="Weight (kg)">
          <TextInput className="text-[15px]" {...bind("weight")} />
        </Field>
        <ComputedBox label="BMI (auto)" value={result.bmi} />
        <Field label="Waist (cm)">
          <TextInput className="text-[15px]" {...bind("waist")} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        {result.alerts.map((a) => (
          <div
            key={a.tag}
            className="flex items-center gap-2.5 rounded-[14px] bg-warn-wash px-3 py-2.5 text-[13px]"
          >
            <Pill tone="amber" size="xs" className="shrink-0 border border-[#ebcb8b] px-2.5 py-1">
              {a.tag}
            </Pill>
            {a.text}
          </div>
        ))}
        {result.alerts.length === 0 ? (
          <div className="rounded-[14px] bg-ok-tint px-3 py-2.5 text-[13px] text-ok-ink">
            No vitals alerts.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function FindingsPanel() {
  return (
    <Panel aria-labelledby="xm" className="flex flex-col gap-3.5 p-5">
      <h2 id="xm" className="m-0 text-lg font-semibold">
        Examination
      </h2>
      {examFindings.map((f) => (
        <Field key={f.label} label={f.label}>
          <TextArea rows={2} defaultValue={f.text} className="resize-y text-sm leading-[1.7]" />
        </Field>
      ))}
    </Panel>
  );
}

function PlanPanel() {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  return (
    <Panel aria-labelledby="pl" className="flex flex-col gap-3.5 p-5">
      <h2 id="pl" className="m-0 text-lg font-semibold">
        Plan
      </h2>
      <ChipGroup options={planOptions} value={plan} onChange={setPlan} label="Plan" />
      <Field label="Plan notes">
        <TextArea rows={4} defaultValue={planNotes} className="resize-y text-sm leading-[1.7]" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next review">
          <TextInput defaultValue={nextReview} />
        </Field>
        <Field label="Follow-up form">
          <SelectInput>
            {followUpOptions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </Panel>
  );
}

/** Left column of the exam screen: all the editable, stateful sections. */
export function ExamMain() {
  return (
    <div className="flex flex-col gap-4">
      <VitalsPanel />
      <FindingsPanel />
      <PlanPanel />
    </div>
  );
}
