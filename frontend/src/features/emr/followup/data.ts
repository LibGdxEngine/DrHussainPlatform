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
  { id: "mrs", name: "MRS total", title: "MRS total: 21 → 9 in 3 months", values: [21, 14, 9], min: 0, max: 44, band: [16, 44], bandTone: "danger", note: "Shaded: severe score (16+)." },
  { id: "bp", name: "Systolic BP", title: "Systolic BP stable", values: [132, 128, 126], min: 100, max: 160, band: [140, 160], bandTone: "warn", note: "Shaded: amber R20 (140+)." },
  { id: "wt", name: "Weight", title: "Weight down 2 kg", values: [74, 73.5, 72], min: 60, max: 90, band: [60, 60], bandTone: "none", note: "" },
  { id: "e2", name: "Estradiol", title: "Estradiol on treatment", values: [22, 68, 85], min: 0, max: 200, band: [60, 150], bandTone: "ok", note: "Shaded: clinic target range on HRT." },
];

export const xLabels = ["Baseline", "6 weeks", "3 months"] as const;

export type PlanId = "continue" | "dose" | "route" | "stop" | "inv";

export const planOptions: { id: PlanId; label: string }[] = [
  { id: "continue", label: "Continue" },
  { id: "dose", label: "Adjust dose" },
  { id: "route", label: "Change route" },
  { id: "stop", label: "Stop" },
  { id: "inv", label: "Investigate" },
];

export const mrsRows: { label: string; from: number; fromBand: string; fromTone: PillTone; to: number; toBand: string; toTone: PillTone }[] = [
  { label: "Somatic", from: 9, fromBand: "Severe", fromTone: "danger", to: 4, toBand: "Mild", toTone: "ok" },
  { label: "Psychological", from: 8, fromBand: "Severe", fromTone: "danger", to: 3, toBand: "Mild", toTone: "ok" },
  { label: "Urogenital", from: 4, fromBand: "Severe", fromTone: "danger", to: 2, toBand: "Moderate", toTone: "amber" },
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
  { label: "Overall since last visit", value: "Better", emphasis: "good" },
  { label: "Taking treatment as prescribed", value: "Sometimes" },
  { label: "Why", value: "\"The patch keeps falling off at night.\"", wide: true, emphasis: "warn", quote: true },
  { label: "Side effects", value: "Breast tenderness" },
  { label: "Bleeding or spotting", value: "No" },
];

export const currentTreatment = ["Estradiol patch 50 mcg twice weekly", "Micronised progesterone 100 mg nightly"];

export const initialNotes = "Switch patch to estradiol gel (adhesion problems). Continue progesterone. Breast tenderness expected to settle.";
