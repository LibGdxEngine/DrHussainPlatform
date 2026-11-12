import type { IntakeFormDetail } from "@/lib/api/emr/intake";

/**
 * Why the alert rules may not have run on her latest completed form, or null when they did. A form
 * sent before the question catalogue (no `catalogue_version`) is not expected to have been checked,
 * so only its recorded errors count.
 */
export function rulesNotChecked(form: IntakeFormDetail | undefined): string | null {
  if (!form) return null;
  const errors = Array.isArray(form.rule_errors) ? form.rule_errors : [];
  if (errors.length) {
    const rules = [...new Set(errors.map((e) => e.rule))];
    return rules.includes("all")
      ? "The alert rules could not be checked against her latest form."
      : `Some alert rules could not be checked against her latest form: ${rules.join(", ")}.`;
  }
  if (!form.catalogue_version || form.rules_evaluated_at) return null;
  return "The alert rules have not been checked against her latest form yet.";
}
