import type { ChipOption } from "../ui/ChipGroup";
import type { VitalsInput } from "./vitals";

export const examMeta = "زيارة جديدة · الرحم موجود";
export const examFlag = "أحمر · R7 مفتوح";

export const initialVitals: VitalsInput = {
  bp1: "144/92",
  bp2: "138/88",
  height: "162",
  weight: "81",
  waist: "91",
};

export type PlanId = "continue" | "start" | "adjust" | "route" | "investigate" | "stop";

export const planOptions: ChipOption<PlanId>[] = [
  { id: "continue", label: "نكمّل" },
  { id: "start", label: "نبدأ علاج" },
  { id: "adjust", label: "نعدّل الجرعة" },
  { id: "route", label: "نغيّر الطريقة" },
  { id: "investigate", label: "نفحص الأول" },
  { id: "stop", label: "نوقف" },
];

export const initialPlan: PlanId = "investigate";

export const examFindings = [
  {
    label: "كشف الثدي",
    text: "اتعمل. مفيش كتل، مفيش تغيّر في الجلد، مفيش إفرازات من الحلمة.",
  },
  {
    label: "كشف الحوض",
    text: "اتعمل. غشاء مهبلي ضامر، عنق الرحم طبيعي، مفيش نزيف نشط. اتاخدت مسحات.",
  },
];

export const planNotes =
  "سونار مهبلي للنزيف بعد انقطاع الطمث قبل أي HRT جهازي. Estriol مهبلي دلوقتي لأعراض GSM. لو بطانة الرحم أقل من 4 مم، نبدأ estradiol عن طريق الجلد + micronised progesterone (بسبب الصداع النصفي مع أورة). دهون و Lp(a) مع التحاليل الأساسية.";

export const nextReview = "13 يناير 2027 (3 شهور)";
export const followUpOptions = ["تتبعت قبل المراجعة بـ 3 أيام", "متتبعتش"];

export interface ScreeningItem {
  label: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  noteTone?: "danger" | "muted";
  noteMono?: boolean;
}

export const screeningItems: ScreeningItem[] = [
  { label: "الماموجرام في ميعاده", checked: false, note: "آخر مرة 2022", noteTone: "danger" },
  { label: "مسحة عنق الرحم في ميعادها", checked: true, note: "2024 طبيعية" },
  { label: "سونار حوض (نزيف غير طبيعي)", checked: false, note: "R7", noteTone: "danger", noteMono: true },
  { label: "DEXA لو فيه عوامل خطر", checked: false, note: "الأم: هشاشة" },
  { label: "فحص المزاج اتعمل", checked: true, note: "PHQ-2 2 · GAD-2 1", noteMono: true },
  { label: "خطة منع الحمل (مش في مرحلة ما قبل سن اليأس)", checked: true, disabled: true },
];

export interface AutoCalcRow {
  label: string;
  mono?: boolean;
  value: string;
  strong?: boolean;
}

export const autoCalcRows: AutoCalcRow[] = [
  { label: "HOMA-IR", mono: true, value: "مستني التحاليل" },
  { label: "TG / HDL", mono: true, value: "مستني التحاليل" },
  { label: "سنين من آخر دورة", value: "1.2", strong: true },
];
