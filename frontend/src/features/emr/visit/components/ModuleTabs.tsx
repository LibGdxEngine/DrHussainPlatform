"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { IntakeFormDetail, SummaryRow } from "@/lib/api/emr/intake";
import { Panel } from "../../ui/Panel";
import { MenoModule } from "./MenoModule";
import { SummaryRows, hasFlag } from "./HistoryModules";

const MRS_TAB = "mrs";

interface Tab {
  id: string;
  label: string;
  rows: SummaryRow[];
}

/** One tab per section of her answers; sections that share a title (an opener and its detail) share a tab. */
function tabsFor(form: IntakeFormDetail): Tab[] {
  const tabs: Tab[] = [];
  for (const section of form.history_summary) {
    const same = tabs.find((t) => t.label === section.title);
    if (same) same.rows = [...same.rows, ...section.rows];
    else tabs.push({ id: section.module, label: section.title, rows: section.rows });
  }
  return form.mrs?.length ? [{ id: MRS_TAB, label: "Menopause Rating Scale", rows: [] }, ...tabs] : tabs;
}

/** Her answers from the latest completed history form, section by section, in the form's own words. */
export function ModuleTabs({ form }: { form?: IntakeFormDetail }) {
  const [chosen, setChosen] = useState<string | null>(null);

  if (!form) {
    return (
      <Panel aria-label="Modules" className="flex flex-col gap-4 p-5">
        <p className="m-0 text-[13px] text-muted">No completed patient form yet, so nothing has been answered.</p>
      </Panel>
    );
  }
  const tabs = tabsFor(form);
  const tab = tabs.find((t) => t.id === chosen) ?? tabs[0];

  return (
    <Panel aria-label="Modules" className="flex flex-col gap-4 p-5">
      {!tab ? (
        <p className="m-0 text-[13px] text-muted">Her completed form holds no answers to show.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Modules" className="flex flex-wrap gap-1.5 self-start rounded-[22px] bg-canvas p-[5px]">
            {tabs.map((t) => {
              const on = t.id === tab.id;
              const flagged = hasFlag(t.rows);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setChosen(t.id)}
                  className={cn(
                    "flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-full border-0 px-4 text-[13px]",
                    on
                      ? "bg-white font-semibold text-brand-deep shadow-[0_1px_3px_rgb(14_59_39/0.12)]"
                      : "bg-transparent font-medium text-muted",
                  )}
                >
                  {t.label}
                  {flagged ? <span aria-label="has answers to check" className="size-2 rounded-full bg-warn-ink" /> : null}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" aria-label={tab.label}>
            {tab.id === MRS_TAB ? (
              <MenoModule scores={form.mrs ?? null} submittedAt={form.submitted_at} />
            ) : (
              <SummaryRows rows={tab.rows} />
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
