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
      <span className="text-sm font-semibold">تقدّمك في الأعراض (MRS)</span>
      <div dir="ltr" className="flex h-[120px] items-end gap-3.5">
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
      <div dir="ltr" className="flex gap-3.5 text-center text-xs text-ink-2">
        {followUpBars.map((b) => (
          <span key={b.label} dir="rtl" className="flex-1">
            {b.label}
          </span>
        ))}
      </div>
      <span className="text-[13px] text-brand-deep">الأعراض قلّت للنص تقريباً من أول العلاج.</span>
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
    <PhoneFrame label="هـ · استمارة المتابعة (نور صالح)">
      <StepHeader title="متابعة 3 شهور" stepText="خطوة 2 من 3" progress={66} />
      <PhoneBody className="gap-5 px-6 py-[22px]">
        <ProgressChart />
        <Question label="من آخر زيارة، إنتي عاملة إيه؟" className="gap-2.5 [&>span]:text-base">
          <ChoiceGroup label="الحالة العامة" columns={2} size="lg" options={overallOptions} value={overall} onChange={setOverall} />
        </Question>
        <Question label="بتاخدي العلاج زي ما اتكتب؟" className="gap-2.5 [&>span]:text-base">
          <ChoiceGroup label="الالتزام بالعلاج" columns={3} size="lg" options={adherenceOptions} value={adherence} onChange={setAdherence} />
          {adherence !== "yes" ? (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              ليه؟
              <input defaultValue="اللزقة بتقع بالليل على طول." className={phoneInputClass} />
            </label>
          ) : null}
        </Question>
        <Question label="أعراض جانبية" className="gap-2.5 [&>span]:text-base">
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
        <Question label="أي نزيف أو تبقيع؟" className="[&>span]:text-base">
          <ChoiceGroup label="نزيف أو تبقيع" columns={2} size="lg" options={yesNo} value={bleeding} onChange={setBleeding} />
        </Question>
        <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-white px-4 py-3.5">
          <span className="text-sm font-semibold">أدويتك من آخر زيارة · أكّدي أو عدّلي</span>
          {followUpMeds.map((m) => (
            <div key={m} className="flex items-center gap-2.5 text-sm">
              <span dir="ltr" className="flex-1 text-right">
                {m}
              </span>
              <span className="text-xs font-semibold text-ok-ink">✓ لسه باخده</span>
            </div>
          ))}
          <Link href={emrRoutes.intake} className="text-[13px] font-semibold text-brand">
            + ضيفي دوا جديد
          </Link>
        </div>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "ابعتي للدكتور", href: emrRoutes.followup }} />
    </PhoneFrame>
  );
}
