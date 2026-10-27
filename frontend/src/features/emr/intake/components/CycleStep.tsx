import { answerLimits, periodOptions, yesNo, yesNoUnsure } from "../data";
import { ChoiceGroup, ConditionalCard, Question, RadioList, phoneInputClass } from "./controls";
import type { StepProps } from "./ReasonStep";

const NOT_SURE = "Not sure";

/** Periods: the questions below depend on whether periods continue or have stopped. */
export function CycleStep({ answers, onChange }: StepProps) {
  const status = answers.period_status;
  const unsure = answers.last_period === NOT_SURE;
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <label htmlFor="last-period" className="text-base font-semibold">When was your last period?</label>
        <div className="flex gap-2">
          <input
            id="last-period"
            placeholder="e.g. August 2025"
            maxLength={answerLimits.lastPeriod}
            value={unsure ? "" : answers.last_period ?? ""}
            disabled={unsure}
            onChange={(e) => onChange({ last_period: e.target.value })}
            className={`${phoneInputClass} flex-1 disabled:bg-canvas`}
          />
          <button
            type="button"
            aria-pressed={unsure}
            onClick={() => onChange({ last_period: unsure ? "" : NOT_SURE })}
            className={
              unsure
                ? "min-h-[52px] cursor-pointer rounded-2xl border-2 border-brand bg-brand-tint px-3.5 text-sm font-semibold text-brand-ink"
                : "min-h-[52px] cursor-pointer rounded-2xl border border-field bg-white px-3.5 text-sm"
            }
          >
            {NOT_SURE}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-base font-semibold">Your periods now</span>
        <RadioList label="Your periods now" options={periodOptions} value={status} onChange={(v) => onChange({ period_status: v })} />
      </div>
      {status === "stopped" ? (
        <ConditionalCard reason="Shown because your periods have stopped">
          <Question label="Any bleeding a year or more after your last period?">
            <ChoiceGroup
              label="Bleeding a year or more after your last period"
              columns={2}
              options={yesNo}
              value={answers.bleed_after_year}
              onChange={(v) => onChange({ bleed_after_year: v })}
            />
          </Question>
          <label className="flex flex-col gap-2 text-[15px] font-semibold">
            How old were you when your periods stopped?
            <input
              inputMode="numeric"
              maxLength={2}
              value={answers.menopause_age != null ? String(answers.menopause_age) : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                onChange({ menopause_age: digits ? Number(digits) : null });
              }}
              className={phoneInputClass}
            />
          </label>
          <Question label="Do you still have your uterus (womb)?">
            <ChoiceGroup label="Still have your uterus" columns={2} options={yesNo} value={answers.uterus} onChange={(v) => onChange({ uterus: v })} />
          </Question>
        </ConditionalCard>
      ) : null}
      {status === "reg" || status === "irr" ? (
        <ConditionalCard reason="Shown because you still have periods">
          <Question label="Could you be pregnant?">
            <ChoiceGroup label="Could you be pregnant" columns={3} options={yesNoUnsure} value={answers.pregnant} onChange={(v) => onChange({ pregnant: v })} />
          </Question>
        </ConditionalCard>
      ) : null}
      <Question label="Bleeding between periods or after sex?">
        <ChoiceGroup
          label="Bleeding between periods or after sex"
          columns={2}
          options={yesNo}
          value={answers.intermenstrual}
          onChange={(v) => onChange({ intermenstrual: v })}
        />
      </Question>
    </>
  );
}
