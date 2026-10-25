"use client";

import { useState } from "react";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { ChipGroup } from "../../ui/ChipGroup";
import { Field, TextArea, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { currentTreatment, initialNotes, planOptions, type PlanId } from "../data";

/** Doctor's plan card: current treatment, vitals, plan chips, notes, next review. */
export function DoctorPanel() {
  const [plan, setPlan] = useState<PlanId>("route");

  return (
    <Panel aria-labelledby="dr" className="flex flex-col gap-3.5 p-5">
      <h2 id="dr" className="m-0 text-lg font-semibold">
        Doctor
      </h2>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-canvas-2 p-3.5">
        <span className="text-xs text-muted">Current treatment (from prescriptions)</span>
        <span className="text-sm font-semibold leading-[1.7]">
          {currentTreatment.map((line, i) => (
            <span key={line}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </span>
        <span className="text-xs font-semibold text-ok-ink">✓ R10 check passed: progesterone with systemic estrogen</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="BP">
          <TextInput defaultValue="126/80" />
        </Field>
        <Field label="Weight (kg)">
          <TextInput defaultValue="72" />
        </Field>
      </div>
      <ChipGroup label="Plan" options={planOptions} value={plan} onChange={setPlan} />
      <TextArea rows={3} aria-label="Notes" defaultValue={initialNotes} className="resize-y font-[inherit]" />
      <Field label="Next review">
        <TextInput defaultValue="12 Apr 2027 (6 months)" />
      </Field>
      <ActionLink href={emrRoutes.orders} className="min-h-[50px] w-full">
        Save and update prescription
      </ActionLink>
    </Panel>
  );
}
