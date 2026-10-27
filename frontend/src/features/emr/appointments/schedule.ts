import type { Appointment, AppointmentStatus, VisitKind } from "@/lib/api/emr/appointments";
import type { PillTone } from "../ui/Pill";

/** Schedule helpers. Day keys are YYYY-MM-DD in the browser's (the clinic's) local time. */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value?: string | null): value is string {
  return !!value && DAY_KEY.test(value) && dayKey(fromDayKey(value)) === value;
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a day key. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function dayRange(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

/** The clinic week runs Saturday to Friday. */
export function weekOf(key: string): string[] {
  const back = (fromDayKey(key).getDay() + 1) % 7;
  return dayRange(addDays(key, -back), 7);
}

export function weekdayShort(key: string): string {
  return fromDayKey(key).toLocaleDateString("en-GB", { weekday: "short" });
}

/** "Tuesday 27 Oct". */
export function dayTitle(key: string): string {
  return fromDayKey(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

/** "Today", "Tomorrow" or "Thu 29 Oct". */
export function relativeDay(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return fromDayKey(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "09:30" in local time. */
export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The local day of a timestamp. */
export function dayOf(iso: string): string {
  return dayKey(new Date(iso));
}

/** A local date and "HH:MM" as the ISO timestamp the API expects. */
export function startsAt(day: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const date = fromDayKey(day);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

/** Visits still to be seen: not yet seen, cancelled or marked as not attended. */
export function isOpenVisit(status: AppointmentStatus): boolean {
  return status === "booked" || status === "checked_in";
}

export const followUpKinds: ReadonlySet<VisitKind> = new Set<VisitKind>(["followup_3m", "followup_6m", "annual_review"]);

export type FormState = "none" | "notSent" | "notStarted" | "opened" | "inProgress" | "complete" | "locked";

/** Where the visit's patient form stands. "none": this kind of visit needs no form. */
export function formState(appointment: Pick<Appointment, "form_kind" | "form">): FormState {
  const { form } = appointment;
  if (!form) return appointment.form_kind ? "notSent" : "none";
  switch (form.status) {
    case "complete":
      return "complete";
    case "in_progress":
      return "inProgress";
    case "locked":
      return "locked";
    default:
      if (form.opened_at) return "opened";
      return form.sent_at ? "notStarted" : "notSent";
  }
}

export const formStateLabel: Record<FormState, { label: string; tone: PillTone }> = {
  none: { label: "No form", tone: "neutral" },
  notSent: { label: "Not sent", tone: "neutral" },
  notStarted: { label: "Not started", tone: "neutral" },
  opened: { label: "Opened", tone: "amber" },
  inProgress: { label: "In progress", tone: "amber" },
  complete: { label: "Complete", tone: "ok" },
  locked: { label: "Locked", tone: "danger" },
};

/** The form still has to be filled in before the visit. */
export function formOutstanding(state: FormState): boolean {
  return state !== "none" && state !== "complete";
}

/** Group items by a key, keeping first-seen order. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): { key: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return Array.from(groups, ([k, list]) => ({ key: k, items: list }));
}
