import type { PillTone } from "../ui/Pill";

export interface VisitAlert {
  id: string;
  tone: Extract<PillTone, "red" | "amber" | "reminder">;
  tag: string;
  title: string;
  source: string;
  /** Needs a written reason before it can be acknowledged. */
  needsReason?: boolean;
  /** Reminders cannot be acknowledged. */
  reminder?: boolean;
}

export type ModuleTabId = "meno" | "dis" | "core";

export interface MrsDomain {
  label: string;
  score: number;
  max: number;
  severity: string;
  percent: number;
  dark?: boolean;
}

export interface LabeledValue {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface DocumentSlot {
  name: string;
  meta: string;
}

export interface KeyValueRow {
  name: string;
  result: string;
  ideal: string;
  out?: boolean;
  idealLtr?: boolean;
}

export interface SentOrder {
  title: string;
  meta: string;
}

export interface EmailMessage {
  meta: string;
  text: string;
  from: "doctor" | "patient";
}
