import type { CatalogueQuestion, CatalogueSection, IntakeAnswers } from "@/lib/api/emr/intake";

export interface VisitReason {
  id: string;
  label: string;
}

export interface Option<T extends string = string> {
  id: T;
  label: string;
}

/** The patient's answers, keyed by catalogue question id. */
export type Answers = IntakeAnswers;

export type FormKind = "full" | "followup";

/** The MRS step of a follow-up form, which the follow-up section does not list as a question. */
export const MRS_STEP = "mrs";
export const REVIEW_STEP = "review";

/**
 * One screen of the form after the date-of-birth check: one topic, made of one catalogue section (or
 * consecutive sections with the same title), the follow-up MRS, or the check-and-send screen.
 */
export interface Step {
  id: string;
  title: string;
  intro?: string;
  /** The questions asked on this screen, in order (only those shown for the current answers). */
  questions: CatalogueQuestion[];
  sections: CatalogueSection[];
  /** This screen asks the 11 MRS items. */
  mrs: boolean;
}

/** The 11 MRS answers; null until the patient picks a score. */
export type MrsDraft = (number | null)[];

export interface ReviewRow {
  step: string;
  label: string;
  value: string;
}

export interface ProgressBar {
  label: string;
  value: number;
  /** Bar height as a share of the MRS maximum, 0–100. */
  pct: number;
}

export interface MrsBand {
  label: string;
  className: string;
}

export interface MrsSummary {
  total: number;
  band: MrsBand;
  somatic: number;
  psychological: number;
  urogenital: number;
  heartFlag: boolean;
  sexualFlag: boolean;
}
