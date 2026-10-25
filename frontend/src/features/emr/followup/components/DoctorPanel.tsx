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
        الدكتور
      </h2>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-canvas-2 p-3.5">
        <span className="text-xs text-muted">العلاج الحالي (من الروشتات)</span>
        <span dir="ltr" className="text-right text-sm font-semibold leading-[1.7]">
          {currentTreatment.map((line, i) => (
            <span key={line}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </span>
        <span className="text-xs font-semibold text-ok-ink">✓ فحص R10 عدّى: بروجسترون مع الإستروجين الجهازي</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الضغط">
          <TextInput dir="ltr" defaultValue="126/80" className="text-right" />
        </Field>
        <Field label="الوزن (كجم)">
          <TextInput defaultValue="72" />
        </Field>
      </div>
      <ChipGroup label="الخطة" options={planOptions} value={plan} onChange={setPlan} />
      <TextArea rows={3} aria-label="ملاحظات" defaultValue={initialNotes} className="resize-y font-[inherit]" />
      <Field label="المراجعة الجاية">
        <TextInput defaultValue="12 أبريل 2027 (6 شهور)" />
      </Field>
      <ActionLink href={emrRoutes.orders} className="min-h-[50px] w-full">
        احفظ وحدّث الروشتة
      </ActionLink>
    </Panel>
  );
}
