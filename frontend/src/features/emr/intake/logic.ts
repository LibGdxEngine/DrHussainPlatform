import type { FormSave, MrsPoint } from "@/lib/api/emr/intake";
import {
  adherenceOptions,
  answerLimits,
  menopauseModule,
  mrsGroups,
  mrsHeartThreshold,
  mrsItems,
  mrsMax,
  mrsSexualThreshold,
  overallOptions,
  periodOptions,
  sideEffectOptions,
  visitReasons,
  yesNo,
  yesNoUnsure,
} from "./data";
import type {
  Answers,
  FormKind,
  FormModule,
  Medicine,
  MrsBand,
  MrsDraft,
  MrsSummary,
  Option,
  ProgressBar,
  ReviewRow,
  StepId,
} from "./types";

/** Extra form modules implied by the selected reasons: the menopause (MRS) questions, once. */
export function modulesFor(selected: ReadonlySet<string>): FormModule[] {
  return visitReasons.some((r) => r.menopause && selected.has(r.id)) ? [menopauseModule] : [];
}

export const needsMrs = (reasons: readonly string[] | undefined) => modulesFor(new Set(reasons ?? [])).length > 0;

/** The screens of the form, in order. A full form asks the MRS only for menopause reasons. */
export function stepsFor(kind: FormKind, answers: Answers): StepId[] {
  if (kind === "followup") return ["progress", "treatment", "mrs", "notes", "review"];
  return ["reasons", "periods", ...(needsMrs(answers.reasons) ? (["mrs"] as const) : []), "notes", "review"];
}

export const progressPct = (step: number, total: number) => (total > 0 ? Math.round((step / total) * 100) : 0);

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

export function toggleIn<T>(list: readonly T[] | undefined, id: T): T[] {
  const items = list ?? [];
  return items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
}

/** The link token from a `#t=<token>` fragment, or null. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t")?.trim();
  return token ? token : null;
}

/** "YYYY-MM-DD" for a real calendar date, or null. Month is 1–12. */
export function dateOfBirthIso(day: string, month: string, year: string, today = new Date()): string | null {
  const [d, m, y] = [day, month, year].map((v) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN));
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 1900 || y > today.getFullYear() || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1) return null;
  if (date.getTime() > today.getTime()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const emptyMrs = (): MrsDraft => mrsItems.map(() => null);

export function mrsFromSaved(saved: number[] | null | undefined): MrsDraft {
  return mrsItems.map((_, i) => {
    const v = saved?.[i];
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4 ? v : null;
  });
}

export const mrsComplete = (mrs: MrsDraft): mrs is number[] =>
  mrs.length === mrsItems.length && mrs.every((v) => v !== null);

/** Saved answers from the server, as an object (anything else is treated as nothing saved). */
export function answersFromSaved(raw: unknown): Answers {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Answers) } : {};
}

/** Saved medicines, or the latest prescription's, all marked as still taken. */
export function medicinesFor(saved: Answers, current: string[]): Medicine[] {
  if (saved.medicines?.length) return saved.medicines.map((m) => ({ name: m.name, still_taking: m.still_taking }));
  return current.slice(0, answerLimits.medicines).map((name) => ({ name, still_taking: true }));
}

const text = (value: string | undefined, max: number) => {
  const v = value?.trim().slice(0, max);
  return v ? v : undefined;
};

function validAge(age: number | null | undefined): number | undefined {
  const { min, max } = answerLimits.menopauseAge;
  return typeof age === "number" && Number.isInteger(age) && age >= min && age <= max ? age : undefined;
}

/** Strip undefined values so the payload holds only what the patient answered. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * What is sent on save and submit. Only answers for questions the patient can currently see are kept
 * (e.g. pregnancy only while periods continue), and the MRS only once all 11 items are scored.
 */
export function buildPayload(kind: FormKind, answers: Answers, mrs: MrsDraft): FormSave {
  const notes = text(answers.notes, answerLimits.notes);
  let out: Answers;
  if (kind === "followup") {
    out = {
      overall: answers.overall,
      adherence: answers.adherence,
      adherence_reason: answers.adherence && answers.adherence !== "yes"
        ? text(answers.adherence_reason, answerLimits.adherenceReason) : undefined,
      side_effects: answers.side_effects?.length ? answers.side_effects : undefined,
      bleeding: answers.bleeding,
      medicines: answers.medicines
        ?.map((m) => ({ name: m.name.trim().slice(0, answerLimits.medicineName), still_taking: m.still_taking }))
        .filter((m) => m.name)
        .slice(0, answerLimits.medicines),
      notes,
    };
  } else {
    const reasons = answers.reasons?.length ? answers.reasons : undefined;
    const stopped = answers.period_status === "stopped";
    const cycling = answers.period_status === "reg" || answers.period_status === "irr";
    out = {
      reasons,
      other_reason: reasons?.includes("other") ? text(answers.other_reason, answerLimits.otherReason) : undefined,
      last_period: text(answers.last_period, answerLimits.lastPeriod),
      period_status: answers.period_status,
      bleed_after_year: stopped ? answers.bleed_after_year : undefined,
      menopause_age: stopped ? validAge(answers.menopause_age) : undefined,
      uterus: stopped ? answers.uterus : undefined,
      pregnant: cycling ? answers.pregnant : undefined,
      intermenstrual: answers.intermenstrual,
      notes,
    };
  }
  const steps = stepsFor(kind, answers);
  const payload: FormSave = { answers: compact(out) };
  if (steps.includes("mrs") && mrsComplete(mrs)) payload.mrs = mrs;
  return payload;
}

/** Why the patient can't continue from this step yet, or null. */
export function stepProblem(step: StepId, answers: Answers, mrs: MrsDraft): string | null {
  switch (step) {
    case "reasons":
      return answers.reasons?.length ? null : "Choose at least one reason for your visit.";
    case "periods": {
      if (!answers.period_status) return "Tell us about your periods now.";
      const age = answers.menopause_age;
      const { min, max } = answerLimits.menopauseAge;
      if (answers.period_status === "stopped" && age != null && validAge(age) === undefined) {
        return `Enter an age between ${min} and ${max}, or leave it empty.`;
      }
      return null;
    }
    case "mrs": {
      const missing = mrs.filter((v) => v === null).length;
      if (!missing) return null;
      return missing === 1 ? "Answer the last symptom question." : `Answer all the symptom questions (${missing} left).`;
    }
    case "progress":
      return answers.overall ? null : "Tell us how you are feeling since your last visit.";
    case "treatment":
      return answers.adherence ? null : "Tell us whether you are taking your treatment.";
    default:
      return null;
  }
}

const labelOf = <T extends string>(options: Option<T>[], id: T | undefined) =>
  options.find((o) => o.id === id)?.label ?? "Not answered";

/** Plain-English summary of the answers for the check-and-send screen. */
export function reviewRows(kind: FormKind, answers: Answers, mrs: MrsDraft): ReviewRow[] {
  const sent = buildPayload(kind, answers, mrs);
  const a = sent.answers ?? {};
  const rows: ReviewRow[] = [];
  if (kind === "full") {
    const reasons = (a.reasons ?? []).map((id) => (id === "other" && a.other_reason
      ? `Something else: ${a.other_reason}` : visitReasons.find((r) => r.id === id)?.label ?? id));
    rows.push({ step: "reasons", label: "Reasons for your visit", value: reasons.join(", ") || "Not answered" });
    rows.push({ step: "periods", label: "Last period", value: a.last_period ?? "Not answered" });
    rows.push({ step: "periods", label: "Your periods now", value: labelOf(periodOptions, a.period_status) });
    if (a.period_status === "stopped") {
      rows.push({ step: "periods", label: "Bleeding a year or more after your last period", value: labelOf(yesNo, a.bleed_after_year) });
      rows.push({ step: "periods", label: "Age when your periods stopped", value: a.menopause_age != null ? String(a.menopause_age) : "Not answered" });
      rows.push({ step: "periods", label: "Still have your uterus", value: labelOf(yesNo, a.uterus) });
    }
    if (a.period_status === "reg" || a.period_status === "irr") {
      rows.push({ step: "periods", label: "Could you be pregnant", value: labelOf(yesNoUnsure, a.pregnant) });
    }
    rows.push({ step: "periods", label: "Bleeding between periods or after sex", value: labelOf(yesNo, a.intermenstrual) });
  } else {
    rows.push({ step: "progress", label: "Since your last visit", value: labelOf(overallOptions, a.overall) });
    rows.push({
      step: "treatment",
      label: "Taking your treatment",
      value: labelOf(adherenceOptions, a.adherence) + (a.adherence_reason ? `: ${a.adherence_reason}` : ""),
    });
    rows.push({
      step: "treatment",
      label: "Side effects",
      value: (a.side_effects ?? []).map((id) => labelOf(sideEffectOptions, id)).join(", ") || "None",
    });
    rows.push({ step: "treatment", label: "Bleeding or spotting", value: labelOf(yesNo, a.bleeding) });
    if (a.medicines?.length) {
      rows.push({
        step: "treatment",
        label: "Your medicines",
        value: a.medicines.map((m) => `${m.name} (${m.still_taking ? "still taking" : "stopped"})`).join(", "),
      });
    }
  }
  if (stepsFor(kind, answers).includes("mrs")) {
    const answered = mrs.filter((v) => v !== null).length;
    rows.push({
      step: "mrs",
      label: "Symptom questions",
      value: answered === mrsItems.length ? "All answered" : `${answered} of ${mrsItems.length} answered`,
    });
  }
  rows.push({ step: "notes", label: "Anything else", value: a.notes ?? "Nothing added" });
  return rows;
}

/** Up to the four latest earlier MRS scores, oldest first, as chart bars. */
export function progressBars(points: MrsPoint[], limit = 4): ProgressBar[] {
  return [...points]
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(-limit)
    .map((p) => ({
      label: new Date(p.date).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      value: p.total,
      pct: Math.max(4, Math.min(100, Math.round((p.total / mrsMax) * 100))),
    }));
}

/** One sentence about the change between the first and latest earlier score (lower is better). */
export function progressMessage(points: MrsPoint[]): string | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((x, y) => x.date.localeCompare(y.date));
  const first = sorted[0].total;
  const last = sorted[sorted.length - 1].total;
  if (last < first) return `Your symptom score went down from ${first} to ${last}. Lower is better.`;
  if (last > first) return `Your symptom score went up from ${first} to ${last}. The doctor will go through this with you.`;
  return `Your symptom score has stayed at ${last}.`;
}

/** What the patient is told when the link can't be used. `retry` when trying again may help. */
export function linkProblem(code: string | undefined): { title: string; message: string; retry: boolean } {
  switch (code) {
    case "NO_TOKEN":
      return {
        title: "This link is incomplete",
        message: "Open the link exactly as the clinic sent it to you. If it still does not work, ask the clinic to send it again.",
        retry: false,
      };
    case "LINK_INVALID":
      return {
        title: "This link no longer works",
        message: "It may have expired or been replaced by a newer link. Ask the clinic to send you a new one.",
        retry: false,
      };
    case "LINK_LOCKED":
      return {
        title: "This link is locked",
        message: "The date of birth was entered wrongly too many times. For your safety, ask the clinic to send you a new link.",
        retry: false,
      };
    default:
      return {
        title: "We could not open your form",
        message: "Check your internet connection and try again.",
        retry: true,
      };
  }
}

/** "Tuesday 13 Oct, 09:30" for the visit, or null. */
export function visitText(visitAt: string | null | undefined): string | null {
  if (!visitAt) return null;
  const date = new Date(visitAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}
