import type { PatientAlert } from "@/lib/api/emr/alerts";
import type { Appointment, DayCount } from "@/lib/api/emr/appointments";
import type { RequestedTest } from "@/lib/api/emr/orders";
import type { AlertCounts } from "@/features/emr/ui/StatusPills";
import { followUpKinds, formOutstanding, formState, groupBy, isOpenVisit } from "../appointments/schedule";

/** Open alerts per patient id, as Red / Amber / Reminder counts. */
export function alertCountsByPatient(alerts: readonly PatientAlert[]): Map<string, AlertCounts> {
  const counts = new Map<string, AlertCounts>();
  for (const a of alerts) {
    const c = counts.get(a.patient) ?? {};
    c[a.level] = (c[a.level] ?? 0) + 1;
    counts.set(a.patient, c);
  }
  return counts;
}

const levelOrder = { red: 0, amber: 1, reminder: 2 } as const;

/** Alerts grouped by patient, most urgent patient first, each patient's alerts red first. */
export function alertsByPatient(alerts: readonly PatientAlert[]): { patient: string; alerts: PatientAlert[] }[] {
  const sorted = [...alerts].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return groupBy(sorted, (a) => a.patient).map((g) => ({ patient: g.key, alerts: g.items }));
}

export function redAlerts(alerts: readonly PatientAlert[]): { count: number; patients: string[] } {
  const red = alerts.filter((a) => a.level === "red");
  return { count: red.length, patients: Array.from(new Set(red.map((a) => a.patient))) };
}

/** How today's patient forms stand, over the visits still to be seen that need one. */
export function formsSummary(visits: readonly Appointment[]) {
  let needed = 0;
  let complete = 0;
  let notStarted = 0;
  for (const v of visits) {
    if (!isOpenVisit(v.status)) continue;
    const state = formState(v);
    if (state === "none") continue;
    needed += 1;
    if (!formOutstanding(state)) complete += 1;
    else if (state === "notSent" || state === "notStarted" || state === "opened") notStarted += 1;
  }
  return { needed, complete, pending: needed - complete, notStarted };
}

/** The first visit today not yet seen: checked-in patients before those still to arrive. */
export function nextVisit(visits: readonly Appointment[]): Appointment | null {
  return visits.find((v) => v.status === "checked_in") ?? visits.find((v) => v.status === "booked") ?? null;
}

export interface WeekBar {
  day: string;
  count: number;
  kind: "past" | "today" | "future";
}

export function weekBars(week: readonly string[], counts: readonly DayCount[], today: string): WeekBar[] {
  const byDay = new Map(counts.map((c) => [c.date, c.count]));
  return week.map((day) => ({
    day,
    count: byDay.get(day) ?? 0,
    kind: day < today ? "past" : day === today ? "today" : "future",
  }));
}

/** Tests still to arrive, one group per patient, oldest request first. */
export function testsByPatient(tests: readonly RequestedTest[]): { patient: string; tests: RequestedTest[] }[] {
  const sorted = [...tests].sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  return groupBy(sorted, (t) => t.patient).map((g) => ({ patient: g.key, tests: g.items }));
}

/** Follow-up and annual review visits still to come. */
export function upcomingFollowups(visits: readonly Appointment[]): Appointment[] {
  return visits.filter((v) => followUpKinds.has(v.kind) && isOpenVisit(v.status));
}
