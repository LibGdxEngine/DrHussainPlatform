"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { moduleTabs } from "../data";
import type { ModuleTabId } from "../types";
import { MenoModule } from "./MenoModule";
import { CoreHistoryModule, DischargeModule } from "./HistoryModules";

const modules: Record<ModuleTabId, React.ReactNode> = {
  meno: <MenoModule />,
  dis: <DischargeModule />,
  core: <CoreHistoryModule />,
};

export function ModuleTabs() {
  const [tab, setTab] = useState<ModuleTabId>("meno");
  return (
    <Panel aria-label="الأقسام" className="flex flex-col gap-4 p-5">
      <div
        role="tablist"
        aria-label="الأقسام"
        className="flex gap-1.5 self-start rounded-full bg-canvas p-[5px]"
      >
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
      {modules[tab]}
    </Panel>
  );
}
