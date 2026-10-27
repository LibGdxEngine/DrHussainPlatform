import type { IntakeAnswers } from "@/lib/api/emr/intake";

export interface VisitReason {
  id: ReasonId;
  label: string;
  /** Reasons that open the menopause (MRS) questions. */
  menopause?: boolean;
}

export interface FormModule {
  name: string;
  minutes: string;
}

export interface Option<T extends string = string> {
  id: T;
  label: string;
}

/** What the patient can answer; the backend drops anything else. */
export type Answers = IntakeAnswers;
export type ReasonId = NonNullable<Answers["reasons"]>[number];
export type PeriodStatus = NonNullable<Answers["period_status"]>;
export type OverallFeeling = NonNullable<Answers["overall"]>;
export type Adherence = NonNullable<Answers["adherence"]>;
export type SideEffect = NonNullable<Answers["side_effects"]>[number];
export type YesNo = NonNullable<Answers["uterus"]>;
export type YesNoUnsure = NonNullable<Answers["pregnant"]>;
export type Medicine = NonNullable<Answers["medicines"]>[number];

export type FormKind = "full" | "followup";

/** One screen of the form after the date-of-birth check. */
export type StepId = "reasons" | "periods" | "mrs" | "notes" | "progress" | "treatment" | "review";

/** The 11 MRS answers; null until the patient picks a score. */
export type MrsDraft = (number | null)[];

export interface ReviewRow {
  step: StepId;
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
