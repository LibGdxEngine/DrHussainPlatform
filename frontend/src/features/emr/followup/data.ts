import type { PillTone } from "../ui/Pill";

export type MetricId = "mrs" | "bp" | "wt" | "e2";
export type BandTone = "danger" | "warn" | "ok" | "none";

export interface Metric {
  id: MetricId;
  name: string;
  title: string;
  /** Baseline, 6 weeks, 3 months. */
  values: [number, number, number];
  min: number;
  max: number;
  /** [low, high] of the shaded band. */
  band: [number, number];
  bandTone: BandTone;
  note: string;
}

export const metrics: Metric[] = [
  { id: "mrs", name: "MRS الكلي", title: "MRS الكلي: 21 ← 9 في 3 شهور", values: [21, 14, 9], min: 0, max: 44, band: [16, 44], bandTone: "danger", note: "المتظلل: درجة شديدة (16+)." },
  { id: "bp", name: "الضغط الانقباضي", title: "الضغط الانقباضي مستقر", values: [132, 128, 126], min: 100, max: 160, band: [140, 160], bandTone: "warn", note: "المتظلل: أصفر R20 (140+)." },
  { id: "wt", name: "الوزن", title: "الوزن نزل 2 كيلو", values: [74, 73.5, 72], min: 60, max: 90, band: [60, 60], bandTone: "none", note: "" },
  { id: "e2", name: "Estradiol", title: "Estradiol مع العلاج", values: [22, 68, 85], min: 0, max: 200, band: [60, 150], bandTone: "ok", note: "المتظلل: المدى المستهدف للعيادة مع HRT." },
];

export const xLabels = ["البداية", "6 أسابيع", "3 شهور"] as const;

export type PlanId = "continue" | "dose" | "route" | "stop" | "inv";

export const planOptions: { id: PlanId; label: string }[] = [
  { id: "continue", label: "نكمّل" },
  { id: "dose", label: "نعدّل الجرعة" },
  { id: "route", label: "نغيّر الطريقة" },
  { id: "stop", label: "نوقف" },
  { id: "inv", label: "نفحص" },
];

export const mrsRows: { label: string; from: number; fromBand: string; fromTone: PillTone; to: number; toBand: string; toTone: PillTone }[] = [
  { label: "جسدي", from: 9, fromBand: "شديد", fromTone: "danger", to: 4, toBand: "بسيط", toTone: "ok" },
  { label: "نفسي", from: 8, fromBand: "شديد", fromTone: "danger", to: 3, toBand: "بسيط", toTone: "ok" },
  { label: "بولي تناسلي", from: 4, fromBand: "شديد", fromTone: "danger", to: 2, toBand: "متوسط", toTone: "amber" },
];

export interface Answer {
  label: string;
  value: string;
  wide?: boolean;
  /** Visual treatment of the tile and value. */
  emphasis?: "good" | "warn";
  quote?: boolean;
}

export const answers: Answer[] = [
  { label: "عموماً من آخر زيارة", value: "أحسن", emphasis: "good" },
  { label: "ملتزمة بالعلاج", value: "أحياناً" },
  { label: "ليه", value: "\"اللزقة بتقع بالليل على طول.\"", wide: true, emphasis: "warn", quote: true },
  { label: "أعراض جانبية", value: "ألم في الثدي" },
  { label: "نزيف أو تبقيع", value: "لا" },
];

export const currentTreatment = ["Estradiol patch 50 mcg twice weekly", "Micronised progesterone 100 mg nightly"];

export const initialNotes = "نغيّر اللزقة لـ estradiol gel (مشكلة في اللزق). نكمّل البروجسترون. ألم الثدي متوقع يهدى.";
