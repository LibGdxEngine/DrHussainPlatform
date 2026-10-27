import type { Appointment, VisitKind } from "@/lib/api/emr/appointments";
import type { Patient } from "@/lib/api/emr/patients";
import { formatDay } from "../format";
import { channelLabel, type JourneyStep, type StepStatus } from "./data";

export const visitTitle: Record<VisitKind, string> = {
  visit1: "Visit 1",
  visit2: "Visit 2",
  visit3: "Visit 3",
  followup_3m: "3-month follow-up",
  followup_6m: "6-month follow-up",
  annual_review: "Annual HRT review",
  routine: "Routine check-up",
};

const followUpKinds: ReadonlySet<VisitKind> = new Set(["followup_3m", "followup_6m", "annual_review"]);

/** Months from the last visit to the routine follow-up. */
export const FOLLOW_UP_MONTHS = 3;

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function appointmentStatus(appointment: Pick<Appointment, "status" | "starts_at">, now: Date): StepStatus {
  if (appointment.status === "seen") return "done";
  if (appointment.status === "no_show") return "missed";
  const at = new Date(appointment.starts_at);
  if (sameDay(at, now)) return "current";
  return at > now ? "upcoming" : "unrecorded";
}

/** Visits that are not cancelled, oldest first. */
export function activeVisits(appointments: Appointment[]): Appointment[] {
  return appointments
    .filter((a) => a.status !== "cancelled")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/** Today's visit, else the next booked one. */
export function nextVisit(appointments: Appointment[], now: Date): Appointment | undefined {
  const visits = activeVisits(appointments);
  return (
    visits.find((a) => appointmentStatus(a, now) === "current") ??
    visits.find((a) => appointmentStatus(a, now) === "upcoming")
  );
}

/**
 * The pathway from the patient's record: first contact, every visit that was not cancelled, and
 * a "not booked" follow-up step when no follow-up is booked after the last visit.
 */
export function buildJourney(
  patient: Pick<Patient, "created_at" | "first_contact_channel">,
  appointments: Appointment[],
  now: Date,
): JourneyStep[] {
  const steps: JourneyStep[] = [
    {
      id: "contact",
      title: "First contact",
      detail: patient.first_contact_channel ? channelLabel[patient.first_contact_channel] : "Channel not recorded",
      date: formatDay(patient.created_at),
      status: "done",
    },
  ];
  const visits = activeVisits(appointments);
  if (!visits.length) {
    steps.push({ id: "first-visit", title: "Visit 1", detail: "Not booked yet", date: "—", status: "planned" });
    return steps;
  }
  for (const a of visits) {
    steps.push({
      id: a.id,
      title: visitTitle[a.kind] ?? a.kind_label,
      detail: a.reason || a.kind_label,
      date: formatDay(a.starts_at),
      status: appointmentStatus(a, now),
    });
  }
  const pending = visits.filter((a) => {
    const status = appointmentStatus(a, now);
    return status === "current" || status === "upcoming";
  });
  if (pending.some((a) => followUpKinds.has(a.kind))) return steps;
  const lastSeen = [...visits].reverse().find((a) => a.status === "seen");
  // With another visit still to come, the follow-up date is not known yet.
  const date = pending.length || !lastSeen
    ? "After the last visit"
    : `Due ${formatDay(addMonths(new Date(lastSeen.starts_at), FOLLOW_UP_MONTHS).toISOString())}`;
  steps.push({ id: "next-follow-up", title: "3-month follow-up", detail: "Not booked yet", date, status: "planned" });
  return steps;
}
