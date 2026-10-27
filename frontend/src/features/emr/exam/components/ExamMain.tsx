"use client";

import { Field, SelectInput, TextArea, TextInput } from "../../ui/Fields";
import { ChipGroup } from "../../ui/ChipGroup";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { planOptions, type PlanId } from "../data";
import type { ExamForm } from "../form";
import type { VitalsResult } from "../vitals";

export interface PanelProps {
  form: ExamForm;
  onChange: (changes: Partial<ExamForm>) => void;
}

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

const alertTone = { red: "red", amber: "amber", reminder: "reminder" } as const;

function VitalsPanel({ form, onChange, vitals }: PanelProps & { vitals: VitalsResult }) {
  const bind = (key: "bp1" | "bp2" | "height" | "weight" | "waist") => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
  });

  return (
    <Panel aria-labelledby="vt" className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="vt" className="m-0 text-lg font-semibold">Vitals</h2>
        <Field label="Examination date">
          <TextInput type="date" value={form.examined_on} onChange={(e) => onChange({ examined_on: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="BP · Reading 1">
          <TextInput className="text-[15px]" placeholder="120/80" inputMode="numeric" {...bind("bp1")} />
        </Field>
        <Field label="BP · Reading 2">
          <TextInput className="text-[15px]" placeholder="120/80" inputMode="numeric" {...bind("bp2")} />
        </Field>
        <ComputedBox label="Average" value={vitals.bpAvg} />
        <div />
        <Field label="Height (cm)">
          <TextInput className="text-[15px]" inputMode="decimal" {...bind("height")} />
        </Field>
        <Field label="Weight (kg)">
          <TextInput className="text-[15px]" inputMode="decimal" {...bind("weight")} />
        </Field>
        <ComputedBox label="BMI (auto)" value={vitals.bmi} />
        <Field label="Waist (cm)">
          <TextInput className="text-[15px]" inputMode="decimal" {...bind("waist")} />
        </Field>
      </div>
      <div className="flex flex-col gap-2" aria-live="polite">
        {vitals.alerts.map((a) => (
          <div key={a.tag} className="flex items-center gap-2.5 rounded-[14px] bg-warn-wash px-3 py-2.5 text-[13px]">
            <Pill tone={alertTone[a.level]} size="xs" className="shrink-0 px-2.5 py-1">{a.tag}</Pill>
            {a.text}
          </div>
        ))}
        {vitals.alerts.length === 0 ? (
          <div className="rounded-[14px] bg-ok-tint px-3 py-2.5 text-[13px] text-ok-ink">No vitals alerts.</div>
        ) : null}
      </div>
    </Panel>
  );
}

function FindingsPanel({ form, onChange }: PanelProps) {
  return (
    <Panel aria-labelledby="xm" className="flex flex-col gap-3.5 p-5">
      <h2 id="xm" className="m-0 text-lg font-semibold">Examination</h2>
      <Field label="Breast exam">
        <TextArea rows={2} value={form.breast_exam} onChange={(e) => onChange({ breast_exam: e.target.value })}
          placeholder="e.g. No masses, no skin changes" className="resize-y text-sm leading-[1.7]" />
      </Field>
      <Field label="Pelvic exam">
        <TextArea rows={2} value={form.pelvic_exam} onChange={(e) => onChange({ pelvic_exam: e.target.value })}
          placeholder="e.g. Normal cervix, no active bleeding" className="resize-y text-sm leading-[1.7]" />
      </Field>
    </Panel>
  );
}

function PlanPanel({ form, onChange }: PanelProps) {
  return (
    <Panel aria-labelledby="pl" className="flex flex-col gap-3.5 p-5">
      <h2 id="pl" className="m-0 text-lg font-semibold">Plan</h2>
      <ChipGroup<PlanId | ""> options={planOptions} value={form.plan} onChange={(plan) => onChange({ plan })} label="Plan" />
      <Field label="Plan notes">
        <TextArea rows={4} value={form.plan_notes} onChange={(e) => onChange({ plan_notes: e.target.value })}
          className="resize-y text-sm leading-[1.7]" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next review">
          <TextInput type="date" value={form.next_review} onChange={(e) => onChange({ next_review: e.target.value })} />
        </Field>
        <Field label="Follow-up form">
          <SelectInput value={form.send_follow_up_form ? "send" : "no"}
            onChange={(e) => onChange({ send_follow_up_form: e.target.value === "send" })}>
            <option value="send">Send 3 days before review</option>
            <option value="no">Don&apos;t send</option>
          </SelectInput>
        </Field>
      </div>
    </Panel>
  );
}

/** Left column of the exam screen: vitals, findings and plan. */
export function ExamMain({ form, onChange, vitals }: PanelProps & { vitals: VitalsResult }) {
  return (
    <div className="flex flex-col gap-4">
      <VitalsPanel form={form} onChange={onChange} vitals={vitals} />
      <FindingsPanel form={form} onChange={onChange} />
      <PlanPanel form={form} onChange={onChange} />
    </div>
  );
}
