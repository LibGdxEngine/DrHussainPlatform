import type { AlertRule, AnswerCheck } from "@/lib/api/emr/content";
import type { RuleFilter, RuleLevel } from "./types";

export const levelLabel: Record<RuleLevel, string> = { red: "Red", amber: "Amber", reminder: "Reminder" };

/** Filter chips with live counts. */
export function filterOptions(rules: AlertRule[]): { id: RuleFilter; label: string }[] {
  const count = (level: RuleLevel) => rules.filter((r) => r.level === level).length;
  const unchecked = rules.filter((r) => !ruleChecks(r).length).length;
  return [
    { id: "all", label: `All (${rules.length})` },
    { id: "red", label: `Red (${count("red")})` },
    { id: "amber", label: `Amber (${count("amber")})` },
    { id: "reminder", label: `Reminder (${count("reminder")})` },
    { id: "unchecked", label: `Not checked automatically (${unchecked})` },
  ];
}

export function matchesFilter(rule: AlertRule, filter: RuleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unchecked") return !ruleChecks(rule).length;
  return rule.level === filter;
}

/** The form question each answer check reads, with its forms section (as in content/answer_checks.py). */
export const answerCheckLabel: Record<AnswerCheck, string> = {
  breast_cancer: "Breast cancer (ever), 6A",
  coronary_disease: "Heart attack, angina or known coronary disease, 6A",
  stroke_tia: "Stroke or mini-stroke (TIA), 6A",
  vte: "Blood clot in leg or lung (DVT/PE), 6A",
  liver_disease: "Active liver disease, 6A",
  unexplained_bleeding: "Unexplained vaginal bleeding now, 6A",
  bleeding_after_year: "Any bleeding 12 months after the last period, 3",
  intermenstrual_bleeding: "Bleeding between periods or after sex, 3",
  peanut_allergy_progesterone: "Peanut allergy with a current medicine, 7",
  pregnancy_pain_bleeding: "Could you be pregnant, with pain or bleeding, 5 / 10b",
  pelvic_pain_fever: "Pelvic pain with fever, 10b",
  breast_concern: "Breast lump, discharge or skin change, 10b",
  self_harm: "Self-harm question, 6D",
  age_or_years_since_period: "Age, or years since the last period or menopause, 2 / 3",
  menopause_age: "Age at menopause, 3",
  migraine_aura: "Migraine with aura, 6B",
  smoking: "Smoker / vaper, 6B",
  alcohol_units: "Units or drinks per week, 9",
  fh_breast_cancer: "Family history of breast cancer, 8",
  fh_ovarian_brca: "Family history of ovarian cancer or a cancer gene, 8",
  fh_vte: "Family history of blood clots, 8",
  fh_premature_cvd: "Family history of heart attack or stroke at a young age, 8",
  pregnancy_complications: "Pregnancy complications, 5",
  phq2_gad2: "PHQ-2 or GAD-2 score, 6D",
  mrs_heart: "MRS item 2, heart discomfort, 4",
  desire_bother: "Low desire that bothers you, 10",
  medicine_listed: "A listed supplement or medicine, 7",
  utis_per_year: "Urine infections in the last year, 10",
  mammogram_date: "Last mammogram date, 5",
  smear_date: "Last cervical smear date, 5",
  lng_ius_date: "LNG-IUS insertion date, 5",
};

const labCheckText: Record<string, string> = {
  gt: "above the cut-off", gte: "at or above", lt: "below the cut-off", lte: "at or below", never_measured: "never measured",
};

const vitalText: Record<string, string> = { blood_pressure: "blood pressure (average)", bmi: "BMI", waist: "waist" };

export interface RuleCheck {
  kind: "answer" | "lab" | "vital";
  text: string;
}

/** How the platform checks a rule automatically; empty when the doctor has to apply it by hand. */
export function ruleChecks(rule: Pick<AlertRule, "answer_check" | "lab_check" | "lab_test_code" | "vital">): RuleCheck[] {
  const checks: RuleCheck[] = [];
  if (rule.answer_check) {
    const label = answerCheckLabel[rule.answer_check as AnswerCheck] ?? rule.answer_check;
    checks.push({ kind: "answer", text: `Answer check: ${label}` });
  }
  if (rule.lab_check) {
    const how = labCheckText[rule.lab_check] ?? rule.lab_check;
    checks.push({ kind: "lab", text: `Lab results: ${how}${rule.lab_test_code ? ` · ${rule.lab_test_code}` : ""}` });
  }
  if (rule.vital) checks.push({ kind: "vital", text: `Examination: ${vitalText[rule.vital] ?? rule.vital}` });
  return checks;
}

const NUMBER = /^\s*-?\d+(?:[.,]\d+)?\s*$/;

/**
 * A cut-off box that is shown but holds no number (blank, or a "[set]" marker), so the automatic
 * check cannot use it. `null` means the rule has no such box.
 */
export function cutoffNotSet(...values: (string | null | undefined)[]): boolean {
  return values.some((v) => v != null && !NUMBER.test(v));
}

/** The server's limits on AlertRule.medicine_terms. */
export const MAX_MEDICINE_TERMS = 20;
export const MAX_MEDICINE_TERM_LENGTH = 80;

/** Answer checks that read the rule's medicine names. */
const MEDICINE_CHECKS = new Set(["medicine_listed", "peanut_allergy_progesterone"]);

/** Whether the rules board offers the medicine-name editor for this rule. */
export function usesMedicineTerms(rule: Pick<AlertRule, "answer_check" | "medicine_terms">): boolean {
  return Boolean(rule.medicine_terms?.length) || MEDICINE_CHECKS.has(rule.answer_check ?? "");
}

/**
 * Add a typed medicine name to the list: trimmed, and refused (with the reason) when blank, too long,
 * already listed (ignoring case) or over the limit.
 */
export function addMedicineTerm(terms: string[], typed: string): { terms: string[]; error: string | null } {
  const term = typed.trim();
  if (!term) return { terms, error: "Type a medicine name first." };
  if (term.length > MAX_MEDICINE_TERM_LENGTH) {
    return { terms, error: `A medicine name can be at most ${MAX_MEDICINE_TERM_LENGTH} characters.` };
  }
  if (terms.some((t) => t.toLowerCase() === term.toLowerCase())) return { terms, error: "That name is already listed." };
  if (terms.length >= MAX_MEDICINE_TERMS) return { terms, error: `A rule can list at most ${MAX_MEDICINE_TERMS} medicine names.` };
  return { terms: [...terms, term], error: null };
}

export function sameTerms(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}
