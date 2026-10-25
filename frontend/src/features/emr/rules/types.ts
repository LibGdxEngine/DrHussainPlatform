export type RuleLevel = "red" | "amb" | "rem";

export type RuleFilter = "all" | RuleLevel;

/** One alert rule (R1-R40). Text/threshold slots render as: pre [a] mid [b] post. */
export interface Rule {
  id: string;
  field: string;
  pre: string;
  /** Editable first threshold, or null when the rule has none. */
  a: string | null;
  mid: string;
  /** Editable second threshold, or null when the rule has none. */
  b: string | null;
  post: string;
  level: RuleLevel;
  /** Message shown to the doctor. */
  msg: string;
}
