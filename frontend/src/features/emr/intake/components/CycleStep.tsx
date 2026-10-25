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
    <PhoneFrame label="ج · خطوة من الاستمارة (فيها أسئلة بتظهر حسب الإجابة)">
      <StepHeader title="الدورة الشهرية" stepText={`خطوة 3 من ${totalSteps}`} progress={progressPct(3, totalSteps)}>
        <Link
          href={emrRoutes.intake}
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-brand"
        >
          💾 احفظي وكمّلي بعدين
        </Link>
      </StepHeader>
      <PhoneBody className="gap-[22px] p-6">
        <div className="flex flex-col gap-2.5">
          <span className="text-base font-semibold">آخر دورة كانت امتى؟</span>
          <div className="flex gap-2">
            <input defaultValue="أغسطس 2025" aria-label="آخر دورة" className={`${phoneInputClass} flex-1`} />
            <button
              type="button"
              className="min-h-[52px] cursor-pointer rounded-2xl border border-field bg-white px-3.5 text-sm"
            >
              مش متأكدة
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-base font-semibold">الدورة دلوقتي</span>
          <RadioList label="الدورة دلوقتي" options={periodOptions} value={period} onChange={setPeriod} />
        </div>
        {period === "stopped" ? (
          <ConditionalCard reason="ظهر عشان الدورة وقفت">
            <Question label="حصل أي نزيف بعد سنة أو أكتر من آخر دورة؟">
              <ChoiceGroup label="نزيف بعد سنة" columns={2} options={yesNo} value={bleedAfterYear} onChange={setBleedAfterYear} />
            </Question>
            <label className="flex flex-col gap-2 text-[15px] font-semibold">
              سنك كان كام لما الدورة وقفت؟
              <input defaultValue="51" inputMode="numeric" className={phoneInputClass} />
            </label>
            <Question label="الرحم موجود؟">
              <ChoiceGroup label="الرحم موجود" columns={2} options={yesNo} value={uterus} onChange={setUterus} />
            </Question>
          </ConditionalCard>
        ) : null}
        {period === "reg" || period === "irr" ? (
          <ConditionalCard reason="ظهر عشان الدورة لسه شغالة">
            <Question label="ممكن تكوني حامل؟">
              <ChoiceGroup label="حمل محتمل" columns={3} options={yesNoUnsure} value={pregnant} onChange={setPregnant} />
            </Question>
          </ConditionalCard>
        ) : null}
        <Question label="نزيف بين الدورات أو بعد العلاقة؟">
          <ChoiceGroup label="نزيف بين الدورات" columns={2} options={yesNo} value={intermenstrual} onChange={setIntermenstrual} />
        </Question>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "كمّلي", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
