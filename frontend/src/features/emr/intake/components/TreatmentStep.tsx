"use client";

import { useState } from "react";
import { adherenceOptions, answerLimits, sideEffectOptions, yesNo } from "../data";
import { toggleIn } from "../logic";
import { ChoiceGroup, Question, ToggleChip, phoneInputClass } from "./controls";
import type { StepProps } from "./ReasonStep";

const stillTaking = [
  { id: "yes", label: "Still taking" },
  { id: "no", label: "Stopped" },
] as const;

/** Follow-up: adherence, side effects, bleeding and the medicines from the last prescription. */
export function TreatmentStep({ answers, onChange }: StepProps) {
  const [newMedicine, setNewMedicine] = useState("");
  const medicines = answers.medicines ?? [];
  const canAdd = newMedicine.trim().length > 0 && medicines.length < answerLimits.medicines;

  const add = () => {
    if (!canAdd) return;
    onChange({ medicines: [...medicines, { name: newMedicine.trim(), still_taking: true }] });
    setNewMedicine("");
  };

  return (
    <>
      <Question label="Are you taking your treatment as prescribed?" className="gap-2.5 [&>span]:text-base">
        <ChoiceGroup
          label="Taking your treatment as prescribed"
          columns={3}
          size="lg"
          options={adherenceOptions}
          value={answers.adherence}
          onChange={(v) => onChange({ adherence: v })}
        />
        {answers.adherence && answers.adherence !== "yes" ? (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            What makes it hard? (optional)
            <input
              maxLength={answerLimits.adherenceReason}
              value={answers.adherence_reason ?? ""}
              onChange={(e) => onChange({ adherence_reason: e.target.value })}
              className={phoneInputClass}
            />
          </label>
        ) : null}
      </Question>
      <Question label="Any side effects?" className="gap-2.5 [&>span]:text-base">
        <div role="group" aria-label="Side effects" className="flex flex-wrap gap-2">
          {sideEffectOptions.map((o) => (
            <ToggleChip
              key={o.id}
              size="md"
              selected={answers.side_effects?.includes(o.id) ?? false}
              onClick={() => onChange({ side_effects: toggleIn(answers.side_effects, o.id) })}
            >
              {o.label}
            </ToggleChip>
          ))}
        </div>
      </Question>
      <Question label="Any bleeding or spotting?" className="[&>span]:text-base">
        <ChoiceGroup label="Any bleeding or spotting" columns={2} size="lg" options={yesNo} value={answers.bleeding} onChange={(v) => onChange({ bleeding: v })} />
      </Question>
      <section aria-labelledby="meds" className="flex flex-col gap-3 rounded-[18px] border border-line bg-white px-4 py-3.5">
        <h2 id="meds" className="m-0 text-sm font-semibold">Your medicines</h2>
        {medicines.length ? (
          <p className="m-0 text-[13px] text-muted">Tell us if you are still taking each one.</p>
        ) : (
          <p className="m-0 text-[13px] text-muted">We have no medicines on record for you. Add any you take.</p>
        )}
        {medicines.map((m, i) => (
          <div key={`${m.name}-${i}`} className="flex flex-col gap-2 border-b border-line-soft pb-3 last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[15px]">{m.name}</span>
              <button
                type="button"
                onClick={() => onChange({ medicines: medicines.filter((_, j) => j !== i) })}
                className="cursor-pointer text-[13px] font-semibold text-muted underline"
                aria-label={`Remove ${m.name}`}
              >
                Remove
              </button>
            </div>
            <ChoiceGroup
              label={`${m.name}: still taking`}
              columns={2}
              options={[...stillTaking]}
              value={m.still_taking ? "yes" : "no"}
              onChange={(v) => onChange({ medicines: medicines.map((x, j) => (j === i ? { ...x, still_taking: v === "yes" } : x)) })}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="new-medicine">Add a medicine</label>
          <input
            id="new-medicine"
            placeholder="Add a medicine"
            maxLength={answerLimits.medicineName}
            value={newMedicine}
            onChange={(e) => setNewMedicine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={`${phoneInputClass} flex-1`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="min-h-[52px] cursor-pointer rounded-2xl border-[1.5px] border-brand bg-white px-4 text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>
    </>
  );
}
