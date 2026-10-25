import type { PillTone } from "../ui/Pill";

/** Clinic pathway: contact → visit 1 → visit 2 → optional visit 3 → 3-month follow-up. */
export type StepId = "contact" | "v1" | "v2" | "v3" | "fu";
export type StepStatus = "done" | "current" | "waiting" | "upcoming" | "skipped";

export interface JourneyStep {
  id: StepId;
  title: string;
  detail: string;
  date: string;
  status: StepStatus;
  optional?: boolean;
}

export const stepStatus: Record<StepStatus, { label: string; tone: PillTone }> = {
  done: { label: "Done", tone: "ok" },
  current: { label: "Today", tone: "brand" },
  waiting: { label: "Awaiting files", tone: "amber" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  skipped: { label: "Not needed", tone: "reminder" },
};

export type ContactChannel = "whatsapp" | "email" | "phone" | "walkin";

export const contactChannels: { id: ContactChannel; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "walkin", label: "Walk-in" },
];

export const channelLabel: Record<ContactChannel, string> = Object.fromEntries(
  contactChannels.map((c) => [c.id, c.label]),
) as Record<ContactChannel, string>;

/** Journey of the demo patient (Laila Ahmed, VC-000142): visit 2 today, files still coming in. */
export const initialJourney: JourneyStep[] = [
  { id: "contact", title: "First contact", detail: "WhatsApp · requested an appointment", date: "2 Oct", status: "done" },
  { id: "v1", title: "Visit 1", detail: "Full history + old files scanned", date: "6 Oct", status: "done" },
  { id: "v2", title: "Visit 2", detail: "Tests requested: 7 · received: 4", date: "13 Oct", status: "waiting" },
  { id: "v3", title: "Visit 3", detail: "If results need review", date: "TBD", status: "upcoming", optional: true },
  { id: "fu", title: "3-month follow-up", detail: "From the last visit", date: "13 Jan 2027", status: "upcoming" },
];

/** Follow-up patient (Nour Saleh): finished visits 1–2, no visit 3, now at 3-month review. */
export const followupJourney: JourneyStep[] = [
  { id: "contact", title: "First contact", detail: "Email", date: "1 Jul", status: "done" },
  { id: "v1", title: "Visit 1", detail: "History + old lab results", date: "8 Jul", status: "done" },
  { id: "v2", title: "Visit 2", detail: "Started HRT", date: "14 Jul", status: "done" },
  { id: "v3", title: "Visit 3", detail: "Doctor decided it is not needed", date: "—", status: "skipped", optional: true },
  { id: "fu", title: "3-month follow-up", detail: "Follow-up form completed", date: "13 Oct", status: "current" },
];

export type ArrivalStatus = "pending" | "clinic" | "email" | "entered";

export const arrivalStatus: Record<ArrivalStatus, { label: string; tone: PillTone }> = {
  pending: { label: "Waiting", tone: "neutral" },
  clinic: { label: "Arrived at clinic · scanned", tone: "brand" },
  email: { label: "Arrived by email", tone: "amber" },
  entered: { label: "Entered", tone: "ok" },
};

export interface RequestedFile {
  id: string;
  name: string;
  visit: "v2" | "v3";
  status: ArrivalStatus;
}

/** What the doctor asked for at visit 1, to be brought to visit 2. */
export const requestedFiles: RequestedFile[] = [
  { id: "ferritin", name: "Ferritin", visit: "v2", status: "entered" },
  { id: "vitd", name: "Vitamin D", visit: "v2", status: "entered" },
  { id: "tsh", name: "TSH", visit: "v2", status: "clinic" },
  { id: "lipids", name: "Lipid panel", visit: "v2", status: "email" },
  { id: "hba1c", name: "HbA1c", visit: "v2", status: "pending" },
  { id: "lpa", name: "Lp(a)", visit: "v2", status: "pending" },
  { id: "tvus", name: "TVUS · transvaginal ultrasound", visit: "v2", status: "pending" },
];

export function countArrived(list: RequestedFile[]) {
  return list.filter((f) => f.status !== "pending").length;
}

export const visitLabel: Record<"v1" | "v2" | "v3" | "fu", string> = {
  v1: "Visit 1",
  v2: "Visit 2",
  v3: "Visit 3",
  fu: "3-month follow-up",
};

export type VisitKey = keyof typeof visitLabel;

export const CLINIC_EMAIL = "files@v-clinic.eg";

/** Standard "send us your case" request the doctor sends to any patient. */
export function caseRequestText(name: string, mrn: string) {
  return (
    `Dear ${name}, before your next visit, please email us your case: ` +
    `any old reports, test results, ultrasound and scans (a clear photo or PDF). ` +
    `Send them to ${CLINIC_EMAIL} with your file number ${mrn} in the subject line. ` +
    `If you can't email them, please bring them with you and reception will scan them for you.`
  );
}
