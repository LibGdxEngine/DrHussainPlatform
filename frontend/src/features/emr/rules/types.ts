import type { AlertRule } from "@/lib/api/emr/content";

export type RuleLevel = AlertRule["level"];

export type RuleFilter = "all" | RuleLevel;

/** An unsaved edit to one rule: changed cut-offs and/or on/off. */
export interface RuleEdit {
  threshold_a?: string;
  threshold_b?: string;
  enabled?: boolean;
}
