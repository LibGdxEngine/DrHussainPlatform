export interface VisitReason {
  id: string;
  label: string;
  /** Extra question module added to the form when this reason is picked. */
  module?: { title: string; minutes: string };
  /** Reasons that open the menopause module (shared by several reasons). */
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

export type PeriodStatus = "reg" | "irr" | "stopped" | "horm" | "hyst";
export type OverallFeeling = "much" | "better" | "same" | "worse";
export type Adherence = "yes" | "some" | "stop";

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
