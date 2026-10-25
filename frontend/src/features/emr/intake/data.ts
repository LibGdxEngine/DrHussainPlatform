import type { Adherence, OverallFeeling, Option, PeriodStatus, VisitReason } from "./types";

export const menopauseModule = { name: "Menopause questions", minutes: "About 4 min" };

export const visitReasons: VisitReason[] = [
  { id: "routine", label: "Routine check-up / smear" },
  { id: "heavy", label: "Heavy or irregular periods", module: { title: "heavy or irregular bleeding", minutes: "2 min" } },
  { id: "bleed", label: "Bleeding between periods, after sex or after menopause", module: { title: "bleeding", minutes: "1 min" } },
  { id: "pain", label: "Pelvic or period pain", module: { title: "pelvic pain", minutes: "2 min" } },
  { id: "contra", label: "Contraception", module: { title: "contraception + hormone safety", minutes: "3 min" } },
  { id: "ttc", label: "Trying to conceive", module: { title: "trying to conceive", minutes: "1 min" } },
  { id: "pcos", label: "PCOS, acne or excess hair", module: { title: "PCOS", minutes: "2 min" } },
  { id: "dis", label: "Discharge or infection", module: { title: "discharge and infections", minutes: "1 min" } },
  { id: "uri", label: "Bladder leakage or prolapse", module: { title: "bladder and prolapse", minutes: "1 min" } },
  { id: "pms", label: "Premenstrual symptoms", module: { title: "PMS", minutes: "1 min" } },
  { id: "smear", label: "Abnormal smear follow-up", module: { title: "smear follow-up", minutes: "1 min" } },
  { id: "breast", label: "Breast concern", module: { title: "breast", minutes: "1 min" } },
  { id: "meno", label: "Menopause symptoms (flushes, sleep, mood)", menopause: true },
  { id: "hrt", label: "HRT review", menopause: true },
  { id: "lib", label: "Low desire or vaginal dryness", menopause: true },
  { id: "other", label: "Something else" },
];

export const defaultReasonIds = ["meno", "dis"];
/** Fixed steps of the form besides the per-reason modules. */
export const baseStepCount = 7;

export const periodOptions: Option<PeriodStatus>[] = [
  { id: "reg", label: "Regular" },
  { id: "irr", label: "Irregular" },
  { id: "stopped", label: "Stopped" },
  { id: "horm", label: "On hormones, not sure" },
  { id: "hyst", label: "Had a hysterectomy" },
];

export const mrsItems = [
  "Hot flushes, sweating",
  "Heart discomfort (awareness of heartbeat, skipping, racing, tightness)",
  "Sleep problems",
  "Depressive mood",
  "Irritability",
  "Anxiety",
  "Physical and mental exhaustion",
  "Sexual problems",
  "Bladder problems",
  "Vaginal dryness",
  "Joint and muscle pain",
];

export const mrsScale = ["None", "Mild", "Moderate", "Severe", "Very severe"];
export const mrsScores = [0, 1, 2, 3, 4];
export const defaultMrs = [3, 1, 3, 2, 2, 1, 2, 2, 0, 1, 1];
export const mrsMax = 44;

/** MRS sub-scale item indexes. */
export const mrsGroups = {
  somatic: [0, 1, 2, 10],
  psychological: [3, 4, 5, 6],
  urogenital: [7, 8, 9],
};
/** Item 2 (heart) at or above this raises the R30 flag. */
export const mrsHeartThreshold = 3;
/** Item 8 (sexual) at or above this opens the sexual-health section. */
export const mrsSexualThreshold = 2;

export const overallOptions: Option<OverallFeeling>[] = [
  { id: "much", label: "Much better" },
  { id: "better", label: "Better" },
  { id: "same", label: "The same" },
  { id: "worse", label: "Worse" },
];

export const adherenceOptions: Option<Adherence>[] = [
  { id: "yes", label: "Yes" },
  { id: "some", label: "Sometimes" },
  { id: "stop", label: "Stopped it" },
];

export const sideEffectOptions: Option[] = [
  { id: "breast", label: "Breast pain" },
  { id: "bloat", label: "Bloating" },
  { id: "head", label: "Headache" },
  { id: "sleepy", label: "Drowsiness" },
  { id: "mood", label: "Low mood" },
  { id: "acne", label: "Acne" },
  { id: "hair", label: "Hair loss" },
  { id: "facial", label: "Facial hair" },
];

export const yesNo: Option[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];
export const yesNoUnsure: Option[] = [...yesNo, { id: "unsure", label: "Not sure" }];

/** Follow-up progress chart: MRS at start / 6 weeks / now. */
export const followUpBars = [
  { label: "Start", value: 21, height: 84, kind: "hatched" },
  { label: "6 weeks", value: 14, height: 56, kind: "mid" },
  { label: "Now", value: 9, height: 36, kind: "dark" },
] as const;

export const followUpMeds = ["Estradiol patch 50 mcg", "Progesterone 100 mg"];

export const otpInitial = "729";
