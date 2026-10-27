"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { IntakeFormDetail } from "@/lib/api/emr/intake";
import { Panel } from "../../ui/Panel";
import { readAnswers } from "../answers";
import { MenoModule } from "./MenoModule";
import { CoreHistoryModule, DischargeModule, NotRecorded, PeriodsModule } from "./HistoryModules";

type ModuleTabId = "meno" | "periods" | "dis" | "core";

const moduleTabs: { id: ModuleTabId; label: string }[] = [
  { id: "meno", label: "Menopause" },
  { id: "periods", label: "Periods & bleeding" },
  { id: "dis", label: "Discharge & infections" },
  { id: "core", label: "Core history" },
];

/** History modules from the patient's latest completed history form. */
export function ModuleTabs({ form }: { form?: IntakeFormDetail }) {
  const [tab, setTab] = useState<ModuleTabId>("meno");
  const answers = readAnswers(form?.answers);

  let body: React.ReactNode;
  if (!form && tab !== "core") {
    body = <p className="m-0 text-[13px] text-muted">No completed patient form yet, so nothing has been answered.</p>;
  } else if (tab === "meno") {
    body = (
      <div className="flex flex-col gap-4">
        <MenoModule scores={form?.mrs ?? null} submittedAt={form?.submitted_at} />
        <NotRecorded title="Hormone safety screen" items={["Part A (stop and review)", "Part B (caution)", "PHQ-2", "GAD-2"]} />
      </div>
    );
  } else if (tab === "periods") {
    body = <PeriodsModule answers={answers} />;
  } else if (tab === "dis") {
    body = <DischargeModule answers={answers} />;
  } else {
    body = <CoreHistoryModule />;
  }

  return (
    <Panel aria-label="Modules" className="flex flex-col gap-4 p-5">
      <div role="tablist" aria-label="Modules" className="flex gap-1.5 self-start rounded-full bg-canvas p-[5px]">
        {moduleTabs.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={cn(
                "min-h-[38px] cursor-pointer rounded-full border-0 px-4 text-[13px]",
                on
                  ? "bg-white font-semibold text-brand-deep shadow-[0_1px_3px_rgb(14_59_39/0.12)]"
                  : "bg-transparent font-medium text-muted",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {body}
    </Panel>
  );
}
