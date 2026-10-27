import type { Appointment } from "@/lib/api/emr/appointments";
import type { DocumentSlot } from "@/lib/api/emr/documents";
import type { RequestedTest, RequestedTestStatus } from "@/lib/api/emr/orders";
import type { Patient } from "@/lib/api/emr/patients";
import type { PillTone } from "../ui/Pill";

export type ScanTab = "visit" | "bulk";

export const scanTabs: { id: ScanTab; label: string }[] = [
  { id: "visit", label: "Scan for a visit (reception)" },
  { id: "bulk", label: "Bulk scan (doctor's files)" },
];

/** Who a scan is saved to: from today's schedule or a patient search. */
export type ScanPatient = Pick<Patient, "id" | "file_number" | "full_name">;

export const scanSlots: { id: DocumentSlot; name: string }[] = [
  { id: "lab", name: "Lab results" },
  { id: "us", name: "Ultrasound" },
  { id: "rad", name: "Other imaging" },
  { id: "path", name: "Pathology" },
  { id: "paper", name: "Old paper notes" },
  { id: "letter", name: "Letters" },
];

export const arrivalLabel: Record<RequestedTestStatus, string> = {
  pending: "Waiting",
  clinic: "Arrived",
  email: "By email",
  entered: "Entered",
};

/** One chosen file waiting to be saved, or saved, to a patient's record. */
export interface ScanFile {
  key: string;
  file: File;
  title: string;
  slot: DocumentSlot | "";
  /** YYYY-MM-DD or blank. */
  date: string;
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
  /** The saved document's id. */
  document?: string;
}

let counter = 0;

export function newScanFile(file: File, slot: DocumentSlot | ""): ScanFile {
  counter += 1;
  return { key: `f${counter}-${file.name}`, file, title: fileTitle(file.name), slot, date: "", status: "idle" };
}

/** "scan_0412.pdf" → "scan_0412". */
export function fileTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return (base || name).slice(0, 255);
}

/** A calendar day in the browser's time zone, as the schedule API expects it. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's visits that bring files to scan: checked-in patients first, then by time. */
export function scanQueue(appointments: Appointment[]): Appointment[] {
  return appointments
    .filter((a) => a.needs_scanning && (a.status === "checked_in" || a.status === "booked"))
    .sort((a, b) => {
      const inA = a.status === "checked_in" ? 0 : 1;
      const inB = b.status === "checked_in" ? 0 : 1;
      return inA - inB || a.starts_at.localeCompare(b.starts_at);
    });
}

/** Tests still awaited, plus any that arrived today so a tick can be undone. */
export function scanChecklist(tests: RequestedTest[], today: string): RequestedTest[] {
  return tests
    .filter((t) => t.status === "pending" || (t.arrived_at !== null && localDay(new Date(t.arrived_at)) === today))
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at) || a.name.localeCompare(b.name));
}

export type BulkState = "needs_patient" | "needs_category" | "ready" | "saving" | "saved" | "error";

export const bulkState: Record<BulkState, { label: string; tone: PillTone }> = {
  needs_patient: { label: "Needs patient", tone: "neutral" },
  needs_category: { label: "Needs category", tone: "amber" },
  ready: { label: "Ready to save", tone: "brand" },
  saving: { label: "Saving…", tone: "neutral" },
  saved: { label: "Saved to file", tone: "ok" },
  error: { label: "Not saved", tone: "danger" },
};

export interface BulkRow extends ScanFile {
  patient: ScanPatient | null;
}

export function bulkRowState(row: BulkRow): BulkState {
  if (row.status === "saved" || row.status === "saving") return row.status;
  if (!row.patient) return "needs_patient";
  if (!row.slot) return "needs_category";
  return row.status === "error" ? "error" : "ready";
}
