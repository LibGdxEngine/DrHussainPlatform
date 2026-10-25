"use client";

import Link from "next/link";
import { useState } from "react";
import { emrRoutes } from "../../routes";
import { cn } from "@/lib/utils";
import { adherenceOptions, followUpBars, followUpMeds, overallOptions, sideEffectOptions, yesNo } from "../data";
import { toggleInSet } from "../logic";
import type { Adherence, OverallFeeling } from "../types";
import { PhoneBody, PhoneFooter, PhoneFrame, StepHeader } from "./PhoneFrame";
import { ChoiceGroup, Question, ToggleChip, phoneInputClass } from "./controls";

const barClass = {
  hatched:
    "border border-hatch bg-[repeating-linear-gradient(45deg,var(--color-hatch)_0_3px,#fff_3px_7px)]",
  mid: "bg-brand-mid",
  dark: "bg-brand-ink",
} as const;

function ProgressChart() {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-linear-to-br from-mint-1 to-mint-2 p-[18px]">
      <span className="text-sm font-semibold">Your symptom progress (MRS)</span>
      <div className="flex h-[120px] items-end gap-3.5">
        {followUpBars.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <strong className="text-sm">{b.value}</strong>
            <div
              className={cn("w-11 rounded-full", barClass[b.kind])}
              style={{ height: b.height }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3.5 text-center text-xs text-ink-2">
        {followUpBars.map((b) => (
          <span key={b.label} className="flex-1">
            {b.label}
          </span>
        ))}
      </div>
      <span className="text-[13px] text-brand-deep">Your symptoms have roughly halved since starting treatment.</span>
    </div>
  );
}

/** E: follow-up questionnaire for an existing patient. */
export function FollowUpStep() {
  const [overall, setOverall] = useState<OverallFeeling>("better");
  const [adherence, setAdherence] = useState<Adherence>("some");
  const [sideEffects, setSideEffects] = useState<ReadonlySet<string>>(new Set(["breast"]));
  const [bleeding, setBleeding] = useState("no");

  return (
    <PhoneFrame label="E · Follow-up form (Nour Saleh)">
      <StepHeader title="3-month follow-up" stepText="Step 2 of 3" progress={66} />
      <PhoneBody className="gap-5 px-6 py-[22px]">
        <ProgressChart />
        <Question label="Since your last visit, how are you feeling?" className="gap-2.5 [&>span]:text-base">
          <ChoiceGroup label="Overall feeling" columns={2} size="lg" options={overallOptions} value={overall} onChange={setOverall} />
        </Question>
        <Question label="Are you taking your treatment as prescribed?" className="gap-2.5 [&>span]:text-base">
          <ChoiceGroup label="Treatment adherence" columns={3} size="lg" options={adherenceOptions} value={adherence} onChange={setAdherence} />
          {adherence !== "yes" ? (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Why?
              <input defaultValue="The patch keeps falling off at night." className={phoneInputClass} />
            </label>
          ) : null}
        </Question>
        <Question label="Side effects" className="gap-2.5 [&>span]:text-base">
          <div className="flex flex-wrap gap-2">
            {sideEffectOptions.map((o) => (
              <ToggleChip
                key={o.id}
                size="md"
                selected={sideEffects.has(o.id)}
                onClick={() => setSideEffects((prev) => toggleInSet(prev, o.id))}
              >
                {o.label}
              </ToggleChip>
            ))}
          </div>
        </Question>
        <Question label="Any bleeding or spotting?" className="[&>span]:text-base">
          <ChoiceGroup label="Bleeding or spotting" columns={2} size="lg" options={yesNo} value={bleeding} onChange={setBleeding} />
        </Question>
        <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-white px-4 py-3.5">
          <span className="text-sm font-semibold">Your medicines from last visit · confirm or edit</span>
          {followUpMeds.map((m) => (
            <div key={m} className="flex items-center gap-2.5 text-sm">
              <span className="flex-1">
                {m}
              </span>
              <span className="text-xs font-semibold text-ok-ink">✓ Still taking</span>
            </div>
          ))}
          <Link href={emrRoutes.intake} className="text-[13px] font-semibold text-brand">
            + Add a new medicine
          </Link>
        </div>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "Send to doctor", href: emrRoutes.followup }} />
    </PhoneFrame>
  );
}
