import type { IntakeForm } from "@/lib/api/emr/intake";
import {
  adherenceOptions,
  mrsGroups,
  overallOptions,
  periodOptions,
  sideEffectOptions,
  visitReasons,
  yesNoUnsure,
} from "../intake/data";
import { formatDay } from "../format";
import type { PillTone } from "../ui/Pill";

/** The answers a patient form can hold (backend `AnswersSerializer`); every field is optional. */
export interface FormAnswers {
  reasons: string[];
  other_reason?: string;
  last_period?: string;
  period_status?: string;
  bleed_after_year?: string;
  menopause_age?: number;
  uterus?: string;
  pregnant?: string;
  intermenstrual?: string;
  overall?: string;
  adherence?: string;
  adherence_reason?: string;
  side_effects: string[];
  bleeding?: string;
  medicines: { name: string; still_taking: boolean }[];
  notes?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

/** Reads the stored answers defensively: the API types them as unknown JSON. */
export function readAnswers(raw: unknown): FormAnswers {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const medicines = Array.isArray(a.medicines)
    ? a.medicines.flatMap((m) => {
        if (!m || typeof m !== "object") return [];
        const { name, still_taking } = m as Record<string, unknown>;
        return typeof name === "string" && name ? [{ name, still_taking: still_taking !== false }] : [];
      })
    : [];
  return {
    reasons: texts(a.reasons),
    other_reason: text(a.other_reason),
    last_period: text(a.last_period),
    period_status: text(a.period_status),
    bleed_after_year: text(a.bleed_after_year),
    menopause_age: typeof a.menopause_age === "number" ? a.menopause_age : undefined,
    uterus: text(a.uterus),
    pregnant: text(a.pregnant),
    intermenstrual: text(a.intermenstrual),
    overall: text(a.overall),
    adherence: text(a.adherence),
    adherence_reason: text(a.adherence_reason),
    side_effects: texts(a.side_effects),
    bleeding: text(a.bleeding),
    medicines,
    notes: text(a.notes),
  };
}

function labelFrom(options: { id: string; label: string }[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return options.find((o) => o.id === id)?.label ?? id;
}

export const reasonLabel = (id: string) => labelFrom(visitReasons, id) ?? id;
export const periodLabel = (id?: string) => labelFrom(periodOptions, id);
export const yesNoLabel = (id?: string) => labelFrom(yesNoUnsure, id);
export const overallLabel = (id?: string) => labelFrom(overallOptions, id);
export const adherenceLabel = (id?: string) => labelFrom(adherenceOptions, id);
export const sideEffectLabel = (id: string) => labelFrom(sideEffectOptions, id) ?? id;

// --- Menopause Rating Scale ------------------------------------------------------------------

export type MrsDomainKey = keyof typeof mrsGroups;

export const mrsDomainLabel: Record<MrsDomainKey, string> = {
  somatic: "Somatic",
  psychological: "Psychological",
  urogenital: "Urogenital",
};

export const mrsDomainKeys = Object.keys(mrsGroups) as MrsDomainKey[];

/** Highest possible score per domain: 4 per item. */
export const mrsDomainMax = (key: MrsDomainKey) => mrsGroups[key].length * 4;

export interface MrsBand {
  label: string;
  tone: PillTone;
}

// Lower bounds of mild, moderate and severe. Total matches the patient form's bands.
const bandStarts: Record<MrsDomainKey | "total", [number, number, number]> = {
  total: [5, 9, 16],
  somatic: [3, 5, 9],
  psychological: [2, 4, 7],
  urogenital: [1, 2, 4],
};

export function mrsBand(domain: MrsDomainKey | "total", score: number): MrsBand {
  const [mild, moderate, severe] = bandStarts[domain];
  if (score >= severe) return { label: "Severe", tone: "danger" };
  if (score >= moderate) return { label: "Moderate", tone: "amber" };
  if (score >= mild) return { label: "Mild", tone: "ok" };
  return { label: "None", tone: "neutral" };
}

/** Domain sums from the 11 item scores, or null when the scale was not answered. */
export function mrsDomainScores(scores: number[] | null | undefined): Record<MrsDomainKey, number> | null {
  if (!scores?.length) return null;
  const sum = (idx: readonly number[]) => idx.reduce((s, i) => s + (scores[i] ?? 0), 0);
  return { somatic: sum(mrsGroups.somatic), psychological: sum(mrsGroups.psychological), urogenital: sum(mrsGroups.urogenital) };
}

// --- Form status -----------------------------------------------------------------------------

export const formStatusTone: Record<IntakeForm["status"], PillTone> = {
  complete: "ok",
  in_progress: "amber",
  not_started: "neutral",
  locked: "danger",
};

/** For use mid-sentence: "completed 12 Oct 2026". */
export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Completed 12 Oct 2026", "Sent 3 Oct 2026, not started", … for the latest form, or "Not sent". */
export function formStatusText(form: IntakeForm | undefined): string {
  if (!form) return "Not sent";
  switch (form.status) {
    case "complete":
      return `Completed ${formatDay(form.submitted_at)}`;
    case "in_progress":
      return "Started, not submitted";
    case "locked":
      return "Locked after wrong date-of-birth attempts";
    default:
      if (!form.sent_at) return "Created, not sent yet";
      return `${form.sent_via === "copied" ? "Link copied" : "Emailed"} ${formatDay(form.sent_at)}${form.opened_at ? ", opened" : ""}, not started`;
  }
}
