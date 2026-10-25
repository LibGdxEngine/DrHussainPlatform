import type { ChipOption } from "../ui/ChipGroup";
import type { VitalsInput } from "./vitals";

export const examMeta = "New visit · Uterus present";
export const examFlag = "Red · R7 open";

export const initialVitals: VitalsInput = {
  bp1: "144/92",
  bp2: "138/88",
  height: "162",
  weight: "81",
  waist: "91",
};

export type PlanId = "continue" | "start" | "adjust" | "route" | "investigate" | "stop";

export const planOptions: ChipOption<PlanId>[] = [
  { id: "continue", label: "Continue" },
  { id: "start", label: "Start treatment" },
  { id: "adjust", label: "Adjust dose" },
  { id: "route", label: "Change route" },
  { id: "investigate", label: "Investigate first" },
  { id: "stop", label: "Stop" },
];

export const initialPlan: PlanId = "investigate";

export const examFindings = [
  {
    label: "Breast exam",
    text: "Done. No masses, no skin changes, no nipple discharge.",
  },
  {
    label: "Pelvic exam",
    text: "Done. Atrophic vaginal mucosa, normal cervix, no active bleeding. Swabs taken.",
  },
];

export const planNotes =
  "Transvaginal ultrasound for postmenopausal bleeding before any systemic HRT. Vaginal estriol now for GSM symptoms. If endometrium is under 4 mm, start transdermal estradiol + micronised progesterone (due to migraine with aura). Lipids and Lp(a) with baseline labs.";

export const nextReview = "13 Jan 2027 (3 months)";
export const followUpOptions = ["Send 3 days before review", "Don't send"];

export interface ScreeningItem {
  label: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  noteTone?: "danger" | "muted";
  noteMono?: boolean;
}

export const screeningItems: ScreeningItem[] = [
  { label: "Mammogram up to date", checked: false, note: "Last in 2022", noteTone: "danger" },
  { label: "Cervical smear up to date", checked: true, note: "2024 normal" },
  { label: "Pelvic ultrasound (abnormal bleeding)", checked: false, note: "R7", noteTone: "danger", noteMono: true },
  { label: "DEXA if risk factors", checked: false, note: "Mother: osteoporosis" },
  { label: "Mood screen done", checked: true, note: "PHQ-2 2 · GAD-2 1", noteMono: true },
  { label: "Contraception plan (not perimenopausal)", checked: true, disabled: true },
];

export interface AutoCalcRow {
  label: string;
  mono?: boolean;
  value: string;
  strong?: boolean;
}

export const autoCalcRows: AutoCalcRow[] = [
  { label: "HOMA-IR", mono: true, value: "Awaiting labs" },
  { label: "TG / HDL", mono: true, value: "Awaiting labs" },
  { label: "Years since last period", value: "1.2", strong: true },
];
