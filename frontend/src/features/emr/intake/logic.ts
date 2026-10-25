import {
  baseStepCount,
  menopauseModule,
  mrsGroups,
  mrsHeartThreshold,
  mrsSexualThreshold,
  visitReasons,
} from "./data";
import type { FormModule, MrsBand, MrsSummary } from "./types";

/** Extra form modules implied by the selected reasons (menopause module first, once). */
export function modulesFor(selected: ReadonlySet<string>): FormModule[] {
  const chosen = visitReasons.filter((r) => selected.has(r.id));
  const modules: FormModule[] = chosen
    .filter((r) => r.module)
    .map((r) => ({ name: `Questions on ${r.module!.title}`, minutes: r.module!.minutes }));
  if (chosen.some((r) => r.menopause)) modules.unshift(menopauseModule);
  return modules;
}

export const totalSteps = (modules: FormModule[]) => baseStepCount + modules.length;

export const progressPct = (step: number, total: number) => Math.round((step / total) * 100);

function bandFor(total: number): MrsBand {
  if (total >= 16) return { label: "Severe", className: "text-danger-ink" };
  if (total >= 9) return { label: "Moderate", className: "text-warn-ink" };
  if (total >= 5) return { label: "Mild", className: "text-ok-ink" };
  return { label: "None / minimal", className: "text-muted" };
}

export function summarizeMrs(scores: number[]): MrsSummary {
  const sum = (idx: number[]) => idx.reduce((s, i) => s + scores[i], 0);
  const total = scores.reduce((s, v) => s + v, 0);
  return {
    total,
    band: bandFor(total),
    somatic: sum(mrsGroups.somatic),
    psychological: sum(mrsGroups.psychological),
    urogenital: sum(mrsGroups.urogenital),
    heartFlag: scores[1] >= mrsHeartThreshold,
    sexualFlag: scores[7] >= mrsSexualThreshold,
  };
}

export function toggleInSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
