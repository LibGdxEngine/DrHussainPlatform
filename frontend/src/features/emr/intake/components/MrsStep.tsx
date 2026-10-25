"use client";

import { useState } from "react";
import { emrRoutes } from "../../routes";
import { cn } from "@/lib/utils";
import { defaultMrs, mrsItems, mrsMax, mrsScale, mrsScores } from "../data";
import { progressPct, summarizeMrs } from "../logic";
import { PhoneBody, PhoneFooter, PhoneFrame, StepHeader } from "./PhoneFrame";

interface MrsStepProps {
  totalSteps: number;
}

/** D: 11-item MRS questionnaire with a live doctor-facing score. */
export function MrsStep({ totalSteps }: MrsStepProps) {
  const [scores, setScores] = useState<number[]>(defaultMrs);
  const summary = summarizeMrs(scores);

  const setScore = (index: number, value: number) =>
    setScores((prev) => prev.map((s, i) => (i === index ? value : s)));

  return (
    <PhoneFrame label="د · مقياس الأعراض MRS">
      <StepHeader title="أسئلة سن اليأس" stepText={`خطوة 4 من ${totalSteps}`} progress={progressPct(4, totalSteps)} />
      <PhoneBody className="gap-4 px-5 py-[22px]">
        <h2 className="m-0 text-[22px] font-bold leading-normal">أنهي من الأعراض دي عندك دلوقتي؟</h2>
        <div dir="ltr" className="grid grid-cols-5 gap-1.5 text-center text-[11px] text-muted">
          {mrsScale.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        {mrsItems.map((label, i) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">
              {i + 1}. {label}
            </span>
            <div dir="ltr" role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
              {mrsScores.map((v) => {
                const on = scores[i] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setScore(i, v)}
                    className={cn(
                      "min-h-12 cursor-pointer rounded-[14px] text-[17px]",
                      on
                        ? "bg-brand-ink font-bold text-white"
                        : "border border-field bg-white text-ink",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 rounded-[18px] border border-dashed border-hatch bg-white px-4 py-3.5">
          <span className="text-xs font-semibold text-muted">للعرض على الدكتور بس: الدرجة لايف</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold leading-none">{summary.total}</span>
            <span className="text-sm text-muted">/ {mrsMax}</span>
            <span className={cn("ms-auto text-sm font-semibold", summary.band.className)}>
              {summary.band.label}
            </span>
          </div>
          <span className="text-[13px] text-ink-3">
            جسدي {summary.somatic} · نفسي {summary.psychological} · بولي تناسلي {summary.urogenital}
          </span>
          {summary.heartFlag ? (
            <span className="rounded-[10px] bg-warn-tint px-2.5 py-1.5 text-xs text-warn-ink">
              أصفر · R30: تعب القلب ≥3، اتقيّم قبل ما تنسبه لسن اليأس
            </span>
          ) : null}
          {summary.sexualFlag ? (
            <span className="rounded-[10px] bg-brand-tint px-2.5 py-1.5 text-xs text-ok-ink">
              بند 8 ≥2 ← قسم الصحة الجنسية اتفتح
            </span>
          ) : null}
        </div>
        <p className="m-0 text-[11px] leading-[1.6] text-subtle">
          النص النهائي لازم يكون الترجمة العربي الرسمية من موقع MRS.
        </p>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "كمّلي", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
