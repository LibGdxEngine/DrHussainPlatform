"use client";

import Link from "next/link";
import { useState } from "react";
import { emrRoutes } from "../../routes";
import { periodOptions, yesNo, yesNoUnsure } from "../data";
import { progressPct } from "../logic";
import type { PeriodStatus } from "../types";
import { PhoneBody, PhoneFooter, PhoneFrame, StepHeader } from "./PhoneFrame";
import { ChoiceGroup, Question, RadioList, phoneInputClass } from "./controls";

interface CycleStepProps {
  totalSteps: number;
}

function ConditionalCard({ reason, children }: { reason: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-white p-4">
      <span className="self-start rounded-full bg-brand-tint px-2.5 py-[3px] text-[11px] font-semibold text-ok-ink">
        {reason}
      </span>
      {children}
    </div>
  );
}

/** C: a form step whose follow-up questions depend on the answer above. */
export function CycleStep({ totalSteps }: CycleStepProps) {
  const [period, setPeriod] = useState<PeriodStatus>("stopped");
  const [bleedAfterYear, setBleedAfterYear] = useState("yes");
  const [uterus, setUterus] = useState("yes");
  const [pregnant, setPregnant] = useState("no");
  const [intermenstrual, setIntermenstrual] = useState("no");

  return (
    <PhoneFrame label="C · Form step (with questions that depend on the answer)">
      <StepHeader title="Periods" stepText={`Step 3 of ${totalSteps}`} progress={progressPct(3, totalSteps)}>
        <Link
          href={emrRoutes.intake}
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-brand"
        >
          💾 Save and finish later
        </Link>
      </StepHeader>
      <PhoneBody className="gap-[22px] p-6">
        <div className="flex flex-col gap-2.5">
          <span className="text-base font-semibold">When was your last period?</span>
          <div className="flex gap-2">
            <input defaultValue="Aug 2025" aria-label="Last period" className={`${phoneInputClass} flex-1`} />
            <button
              type="button"
              className="min-h-[52px] cursor-pointer rounded-2xl border border-field bg-white px-3.5 text-sm"
            >
              Not sure
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-base font-semibold">Your periods now</span>
          <RadioList label="Your periods now" options={periodOptions} value={period} onChange={setPeriod} />
        </div>
        {period === "stopped" ? (
          <ConditionalCard reason="Shown because your periods have stopped">
            <Question label="Any bleeding a year or more after your last period?">
              <ChoiceGroup label="Bleeding after a year" columns={2} options={yesNo} value={bleedAfterYear} onChange={setBleedAfterYear} />
            </Question>
            <label className="flex flex-col gap-2 text-[15px] font-semibold">
              How old were you when your periods stopped?
              <input defaultValue="51" inputMode="numeric" className={phoneInputClass} />
            </label>
            <Question label="Do you still have your uterus?">
              <ChoiceGroup label="Uterus present" columns={2} options={yesNo} value={uterus} onChange={setUterus} />
            </Question>
          </ConditionalCard>
        ) : null}
        {period === "reg" || period === "irr" ? (
          <ConditionalCard reason="Shown because you still have periods">
            <Question label="Could you be pregnant?">
              <ChoiceGroup label="Possible pregnancy" columns={3} options={yesNoUnsure} value={pregnant} onChange={setPregnant} />
            </Question>
          </ConditionalCard>
        ) : null}
        <Question label="Bleeding between periods or after sex?">
          <ChoiceGroup label="Intermenstrual bleeding" columns={2} options={yesNo} value={intermenstrual} onChange={setIntermenstrual} />
        </Question>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "Continue", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
