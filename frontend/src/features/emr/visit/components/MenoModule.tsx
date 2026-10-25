import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { mrsDomains } from "../data";
import type { MrsDomain } from "../types";

function MrsBar({ domain }: { domain: MrsDomain }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex text-[13px]">
        <span>{domain.label}</span>
        <span className="ms-auto text-muted">
          <strong className="text-ink">{domain.score}</strong> / {domain.max} · {domain.severity}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-[#dcebe1] bg-[repeating-linear-gradient(45deg,#dcebe1_0_3px,#fff_3px_6px)]">
        <div
          className={cn("h-full rounded-full", domain.dark ? "bg-brand-ink" : "bg-brand-mid")}
          style={{ width: `${domain.percent}%` }}
        />
      </div>
    </div>
  );
}

export function MenoModule() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Panel variant="outline" aria-labelledby="mrs" className="flex flex-col gap-3 rounded-[18px] p-[18px]">
        <h3 id="mrs" className="m-0 text-[15px] font-semibold">
          MRS · Baseline 11 Oct
        </h3>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[44px] font-bold leading-none">18</span>
          <span className="text-[15px] text-muted">/ 44</span>
          <Pill tone="danger" className="ms-auto">
            Severe
          </Pill>
        </div>
        {mrsDomains.map((d) => (
          <MrsBar key={d.label} domain={d} />
        ))}
        <span className="text-[13px] font-semibold text-brand">Follow-ups will appear here as a trend line</span>
      </Panel>
      <Panel
        variant="outline"
        aria-labelledby="hs"
        className="flex flex-col gap-2.5 rounded-[18px] p-[18px] text-[13px] leading-relaxed"
      >
        <h3 id="hs" className="m-0 text-[15px] font-semibold">
          Hormone safety screen
        </h3>
        <div>
          Part A (stop and review): <strong>None</strong>
        </div>
        <div>
          Part B (caution): <strong>Migraine with aura</strong>
        </div>
        <div>Age 52, 14 months since last period: within the HRT window</div>
        <div>
          Peanut allergy: <strong>No</strong> · Uterus present: <strong>Yes</strong>
        </div>
        <div className="font-emr-mono text-xs text-ink-3">PHQ-2: 2 · GAD-2: 1 · Self-harm: never</div>
        <p className="m-0 mt-auto rounded-xl bg-brand-tint px-3 py-2.5 font-medium text-brand-deep">
          Systemic HRT can be prescribed once R7 is confirmed. Vaginal estrogen is not locked.
        </p>
      </Panel>
    </div>
  );
}
