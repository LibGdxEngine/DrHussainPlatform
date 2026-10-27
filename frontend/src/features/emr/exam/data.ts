import type { ExaminationPlan } from "@/lib/api/emr/examinations";
import type { ChipOption } from "../ui/ChipGroup";

export type PlanId = ExaminationPlan;

export const planOptions: ChipOption<PlanId>[] = [
  { id: "continue", label: "Continue" },
  { id: "start", label: "Start treatment" },
  { id: "adjust", label: "Adjust dose" },
  { id: "route", label: "Change route" },
  { id: "investigate", label: "Investigate first" },
  { id: "stop", label: "Stop" },
];

/** The screening checklist. Keys match the server's SCREENING_ITEMS (backend/product/records/models.py). */
export const screeningItems: { key: string; label: string }[] = [
  { key: "mammogram", label: "Mammogram up to date" },
  { key: "smear", label: "Cervical smear up to date" },
  { key: "pelvic_us", label: "Pelvic ultrasound (abnormal bleeding)" },
  { key: "dexa", label: "DEXA if risk factors" },
  { key: "mood", label: "Mood screen done" },
  { key: "contraception", label: "Contraception plan (not perimenopausal)" },
];
