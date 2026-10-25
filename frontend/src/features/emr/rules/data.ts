import { emrRoutes } from "../routes";
import type { Rule, RuleFilter, RuleLevel } from "./types";

type RuleTuple = [
  id: string,
  field: string,
  pre: string,
  a: string | null,
  mid: string,
  b: string | null,
  post: string,
  level: RuleLevel,
  msg: string,
];

const tuples: RuleTuple[] = [
  ["R1", "Breast cancer (6a)", "= Yes", null, "", null, "", "red", "Avoid systemic HRT and combined pill"],
  ["R2", "Coronary disease, MI or angina (6a)", "= Yes", null, "", null, "", "red", "Avoid systemic HRT"],
  ["R3", "Stroke or TIA (6a)", "= Yes", null, "", null, "", "red", "Avoid systemic HRT and combined pill"],
  ["R4", "DVT or PE (6a)", "= Yes", null, "", null, "", "red", "Avoid systemic HRT and combined pill"],
  ["R5", "Active liver disease (6a)", "= Yes", null, "", null, "", "red", "Avoid systemic HRT"],
  ["R6", "Current unexplained bleeding (6a)", "= Yes", null, "", null, "", "red", "Investigate before prescribing"],
  ["R7", "Bleeding since last period (3)", "≥", "12", "months", null, "", "red", "Postmenopausal bleeding: exam and TVUS"],
  ["R8", "Postcoital or intermenstrual bleeding (3)", "= Yes", null, "", null, "", "red", "Exam, smear status, TVUS"],
  ["R9", "Bleeding on continuous combined HRT (12)", "after", "6", "months", null, "", "red", "Investigate before changing regimen"],
  ["R10", "Uterus present + prescription", "systemic estrogen without progestogen", null, "", null, "", "red", "Blocks prescription: add endometrial protection"],
  ["R11", "Peanut allergy + prescription", "Prometrium prescribed", null, "", null, "", "red", "Blocks prescription: contains peanut oil"],
  ["R12", "Possible pregnancy (5 / 10b)", "yes or unsure, with pain or bleeding", null, "", null, "", "red", "Rule out ectopic: β-hCG today"],
  ["R13", "Pelvic pain (10b)", "pain + fever", null, "", null, "", "red", "Possible PID"],
  ["R14", "Breast concern (10b)", "new lump, bloody discharge or skin change", null, "", null, "", "red", "Urgent breast referral"],
  ["R15", "Self-harm question (6d)", 'any answer other than "Never"', null, "", null, "", "red", "Same-day review"],
  ["R16", "Age or time since last period (2, 3)", "age ≥", "60", "or >", "10", "years", "amb", "Weigh HRT benefit and risk; use transdermal"],
  ["R17", "Age at menopause (3)", "<", "45", "early; <", "40", "POI", "amb", "HRT until about 51 unless contraindicated"],
  ["R18", "Migraine (6b)", "with aura", null, "", null, "", "amb", "Transdermal only; no combined pill"],
  ["R19", "Smoking (6b)", "current; no combined pill if age ≥", "35", "", null, "", "amb", "Transdermal; no combined pill if ≥35"],
  ["R20", "Blood pressure, average (11)", "≥", "140", "/", "90", "", "amb", "Recheck; treat before HRT or combined pill"],
  ["R21", "BMI (11)", "≥", "30", "", null, "", "amb", "Transdermal; cardiovascular and breast risk"],
  ["R22", "Waist (11)", ">", "88", "cm", null, "", "amb", "Metabolic risk: insulin, HbA1c and lipids"],
  ["R23", "Alcohol (9)", "≥", "14", "units/week", null, "", "amb", "Counsel on breast and heart risk"],
  ["R24", "Family history of breast cancer (8)", "diagnosed before", "50", "or ≥", "2", "relatives", "amb", "Breast risk / genetics assessment"],
  ["R25", "Family history of ovarian cancer or BRCA (8)", "any / yes", null, "", null, "", "amb", "Genetics referral"],
  ["R26", "Family history of VTE (8)", "first-degree relative", null, "", null, "", "amb", "Transdermal only; consider thrombophilia screen"],
  ["R27", "Family history of premature heart disease (8)", "men <", "55", ", women <", "65", "", "amb", "Order Lp(a) if never done"],
  ["R28", "Pregnancy complications (5)", "preeclampsia, gestational diabetes or preterm birth", null, "", null, "", "amb", "Cardiovascular risk factor: lipids and BP"],
  ["R29", "PHQ-2 or GAD-2 (6d)", "score ≥", "3", "", null, "", "amb", "Complete PHQ-9 or GAD-7"],
  ["R30", "MRS item 2, heart discomfort (4)", "≥", "3", "", null, "", "amb", "Assess before attributing (ECG ± Holter)"],
  ["R31", "Distressing low desire (10)", '"Very much"', null, "", null, "", "amb", "HSDD assessment"],
  ["R32", "St John's Wort (7)", "listed", null, "", null, "", "amb", "Check interactions"],
  ["R33", "UTIs per year (10b)", "≥", "2", "and postmenopausal", null, "", "amb", "Offer vaginal estrogen"],
  ["R34", "Total testosterone (labs)", ">", "50", "ng/dL on treatment", null, "", "amb", "Above female range: reduce dose"],
  ["R35", "Testosterone therapy (12)", "no benefit after", "6", "months", null, "", "amb", "Consider stopping"],
  ["R36", "Mammogram date (5)", "older than", "[set]", "months", null, "", "rem", "Screening overdue"],
  ["R37", "Cervical smear date (5)", "older than", "[set]", "months", null, "", "rem", "Screening overdue"],
  ["R38", "LNG-IUS insertion date (5)", "≥", "5", "years", null, "", "rem", "Replace for HRT protection"],
  ["R39", "Lp(a) (labs)", "never measured", null, "", null, "", "rem", "Order once in a lifetime"],
  ["R40", "Last annual review (12)", ">", "12", "months", null, "", "rem", "Annual benefit/risk review"],
];

export const rules: Rule[] = tuples.map(([id, field, pre, a, mid, b, post, level, msg]) => ({
  id,
  field,
  pre,
  a,
  mid,
  b,
  post,
  level,
  msg,
}));

export const ruleTotal = rules.length;

export const levelLabel: Record<RuleLevel, string> = { red: "Red", amb: "Amber", rem: "Reminder" };

export const filterOptions: { id: RuleFilter; label: string }[] = [
  { id: "all", label: "All (40)" },
  { id: "red", label: "Red (15)" },
  { id: "amb", label: "Amber (20)" },
  { id: "rem", label: "Reminder (5)" },
];

export const settingsTabs: { label: string; href: string; current?: boolean }[] = [
  { label: "Alert rules", href: emrRoutes.rules, current: true },
  { label: "Score bands", href: emrRoutes.rules },
  { label: "Screening intervals", href: emrRoutes.rules },
  { label: "Order sets", href: emrRoutes.rules },
  { label: "Section triggers", href: emrRoutes.rules },
  { label: "Lab target ranges", href: emrRoutes.rules },
  { label: "Form wording", href: emrRoutes.rules },
  { label: "Users and permissions", href: emrRoutes.audit },
];

export const mrsThresholds: { label: string; aria: string; value: string }[] = [
  { label: "Mild ≥", aria: "Mild", value: "5" },
  { label: "Moderate ≥", aria: "Moderate", value: "9" },
  { label: "Severe ≥", aria: "Severe", value: "16" },
];
