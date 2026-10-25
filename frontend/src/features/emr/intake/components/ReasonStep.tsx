import { emrRoutes } from "../../routes";
import { visitReasons } from "../data";
import { progressPct } from "../logic";
import type { FormModule } from "../types";
import { PhoneBody, PhoneFooter, PhoneFrame, StepHeader } from "./PhoneFrame";
import { ToggleChip } from "./controls";

interface ReasonStepProps {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  modules: FormModule[];
  totalSteps: number;
}

const textareaClass =
  "w-full rounded-2xl border-[1.5px] border-field bg-white px-3.5 py-3 text-[15px] leading-[1.7] outline-none focus:border-brand";

/** B: reason picker; the chosen reasons add question modules to the form. */
export function ReasonStep({ selected, onToggle, modules, totalSteps }: ReasonStepProps) {
  return (
    <PhoneFrame label="B · Reason for visit">
      <StepHeader title="V-Clinic" stepText={`Step 2 of ${totalSteps}`} progress={progressPct(2, totalSteps)} />
      <PhoneBody className="gap-[18px] p-6">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[26px] font-bold leading-[1.4]">What brings you in today?</h2>
          <p className="m-0 text-[15px] leading-[1.7] text-ink-3">
            Choose all that apply. We will only ask the questions that matter to you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visitReasons.map((r) => (
            <ToggleChip key={r.id} selected={selected.has(r.id)} onClick={() => onToggle(r.id)}>
              {r.label}
            </ToggleChip>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-white px-4 py-3.5">
          <span className="text-[13px] font-semibold text-muted">Added to your form</span>
          {modules.map((m) => (
            <div key={m.name} className="flex text-[15px]">
              <span>{m.name}</span>
              <span className="ms-auto text-[13px] text-muted">{m.minutes}</span>
            </div>
          ))}
          {modules.length === 0 ? (
            <span className="text-sm text-muted">Core form only</span>
          ) : null}
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          In your own words, what bothers you most?
          <textarea rows={3} defaultValue="Night sweats and I can't sleep. Also some itching." className={textareaClass} />
        </label>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          What would you like to get from this visit?
          <textarea
            rows={2}
            defaultValue="To sleep through the night and feel like myself at work again."
            className={textareaClass}
          />
        </label>
      </PhoneBody>
      <PhoneFooter backHref={emrRoutes.intake} next={{ label: "Continue", href: emrRoutes.intake }} />
    </PhoneFrame>
  );
}
