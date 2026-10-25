import type { AlertRule } from "@/lib/api/emr/content";
import type { RuleFilter, RuleLevel } from "./types";

export const levelLabel: Record<RuleLevel, string> = { red: "Red", amber: "Amber", reminder: "Reminder" };

/** Filter chips with live counts. */
export function filterOptions(rules: AlertRule[]): { id: RuleFilter; label: string }[] {
  const count = (level: RuleLevel) => rules.filter((r) => r.level === level).length;
  return [
    { id: "all", label: `All (${rules.length})` },
    { id: "red", label: `Red (${count("red")})` },
    { id: "amber", label: `Amber (${count("amber")})` },
    { id: "reminder", label: `Reminder (${count("reminder")})` },
  ];
}
