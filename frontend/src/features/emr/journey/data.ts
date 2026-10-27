import type { PillTone } from "../ui/Pill";

/** One step of the patient's pathway: first contact, each booked visit, then the follow-up. */
export type StepStatus = "done" | "current" | "upcoming" | "missed" | "unrecorded" | "planned";

export interface JourneyStep {
  id: string;
  title: string;
  detail: string;
  date: string;
  status: StepStatus;
}

export const stepStatus: Record<StepStatus, { label: string; tone: PillTone }> = {
  done: { label: "Done", tone: "ok" },
  current: { label: "Today", tone: "brand" },
  upcoming: { label: "Booked", tone: "neutral" },
  missed: { label: "Did not attend", tone: "danger" },
  unrecorded: { label: "Not marked seen", tone: "amber" },
  planned: { label: "Not booked", tone: "reminder" },
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

export type ArrivalStatus = "pending" | "clinic" | "email" | "entered";

export const arrivalStatus: Record<ArrivalStatus, { label: string; tone: PillTone }> = {
  pending: { label: "Waiting", tone: "neutral" },
  clinic: { label: "Arrived at clinic", tone: "brand" },
  email: { label: "Arrived by email", tone: "amber" },
  entered: { label: "Entered", tone: "ok" },
};

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
