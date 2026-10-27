import type {
  Adherence,
  FormKind,
  OverallFeeling,
  Option,
  PeriodStatus,
  SideEffect,
  StepId,
  VisitReason,
  YesNo,
  YesNoUnsure,
} from "./types";

export const menopauseModule = { name: "Menopause questions", minutes: "About 4 min" };

/** Same ids as the backend's VISIT_REASONS. */
export const visitReasons: VisitReason[] = [
  { id: "routine", label: "Routine check-up / smear" },
  { id: "heavy", label: "Heavy or irregular periods" },
  { id: "bleed", label: "Bleeding between periods, after sex or after menopause" },
  { id: "pain", label: "Pelvic or period pain" },
  { id: "contra", label: "Contraception" },
  { id: "ttc", label: "Trying to conceive" },
  { id: "pcos", label: "PCOS, acne or excess hair" },
  { id: "dis", label: "Discharge or infection" },
  { id: "uri", label: "Bladder leakage or prolapse" },
  { id: "pms", label: "Premenstrual symptoms" },
  { id: "smear", label: "Abnormal smear follow-up" },
  { id: "breast", label: "Breast concern" },
  { id: "meno", label: "Menopause symptoms (flushes, sleep, mood)", menopause: true },
  { id: "hrt", label: "HRT review", menopause: true },
  { id: "lib", label: "Low desire or vaginal dryness", menopause: true },
  { id: "other", label: "Something else" },
];

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

export const sideEffectOptions: Option<SideEffect>[] = [
  { id: "breast", label: "Breast pain" },
  { id: "bloat", label: "Bloating" },
  { id: "head", label: "Headache" },
  { id: "sleepy", label: "Drowsiness" },
  { id: "mood", label: "Low mood" },
  { id: "acne", label: "Acne" },
  { id: "hair", label: "Hair loss" },
  { id: "facial", label: "Facial hair" },
];

export const yesNo: Option<YesNo>[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];
export const yesNoUnsure: Option<YesNoUnsure>[] = [...yesNo, { id: "unsure", label: "Not sure" }];

export const stepTitles: Record<StepId, string> = {
  reasons: "Reason for your visit",
  periods: "Periods",
  mrs: "Menopause questions",
  notes: "Anything else",
  progress: "How you are doing",
  treatment: "Your treatment",
  review: "Check and send",
};

export const formMinutes: Record<FormKind, string> = {
  full: "about 10 minutes",
  followup: "about 5 minutes",
};

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The backend's limits (AnswersSerializer). */
export const answerLimits = {
  otherReason: 500,
  lastPeriod: 40,
  adherenceReason: 500,
  notes: 2000,
  medicineName: 120,
  medicines: 20,
  menopauseAge: { min: 20, max: 70 },
};
