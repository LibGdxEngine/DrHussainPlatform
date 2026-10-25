import type { PillTone } from "../ui/Pill";

export type FormStatus = "complete" | "inProgress" | "notStarted" | "notSent";

export interface Appointment {
  id: string;
  time: string;
  name: string;
  type: string;
  form: FormStatus;
  sent: string;
  /** "checkin" records attendance; "send" sends/resends the form link. */
  action: "checkin" | "send";
  actionLabel: string;
  /** Visit 2/3 or follow-up: reception scans the files the patient brings. */
  scanVisit?: "v2" | "v3" | "fu";
  mrn: string;
}

export const formStatus: Record<FormStatus, { label: string; tone: PillTone }> = {
  complete: { label: "Complete", tone: "ok" },
  inProgress: { label: "In progress", tone: "amber" },
  notStarted: { label: "Not started", tone: "neutral" },
  notSent: { label: "Not sent", tone: "neutral" },
};

export const appointments: Appointment[] = [
  { id: "0930", time: "09:30", name: "Laila Ahmed", mrn: "VC-000142", scanVisit: "v2", type: "Visit 2 · menopause tests", form: "complete", sent: "Sent 8 Oct", action: "checkin", actionLabel: "Check in" },
  { id: "1015", time: "10:15", name: "Nour Saleh", mrn: "VC-000118", scanVisit: "fu", type: "3-month follow-up", form: "complete", sent: "Sent 9 Oct", action: "checkin", actionLabel: "Check in" },
  { id: "1100", time: "11:00", name: "Dina Farouk", mrn: "VC-000097", scanVisit: "v3", type: "Visit 3 · bleeding, contraception", form: "complete", sent: "Sent 10 Oct", action: "checkin", actionLabel: "Check in" },
  { id: "1145", time: "11:45", name: "Salma Nabil", mrn: "VC-000174", type: "Visit 1 · PCOS", form: "inProgress", sent: "Sent 11 Oct · opened", action: "send", actionLabel: "Send reminder" },
  { id: "1230", time: "12:30", name: "Heba Youssef", mrn: "VC-000131", type: "Annual HRT review", form: "notStarted", sent: "Sent 10 Oct · not opened", action: "send", actionLabel: "Resend link" },
  { id: "1315", time: "13:15", name: "Mona Adel", mrn: "VC-000156", type: "Routine check-up / smear", form: "complete", sent: "Sent 9 Oct", action: "checkin", actionLabel: "Check in" },
  { id: "1400", time: "14:00", name: "Rania Mostafa", mrn: "VC-000189", type: "6-month follow-up", form: "notSent", sent: "Booked today", action: "send", actionLabel: "Send form link" },
];

export const days: { weekday: string; date: string }[] = [
  { weekday: "Tue", date: "13" },
  { weekday: "Wed", date: "14" },
  { weekday: "Thu", date: "15" },
  { weekday: "Sat", date: "17" },
  { weekday: "Sun", date: "18" },
];

export const visitTypes = [
  "Visit 1 · new patient (full history)",
  "Visit 2 · tests",
  "Visit 3",
  "3-month follow-up (short form)",
  "Routine check-up / smear",
];
