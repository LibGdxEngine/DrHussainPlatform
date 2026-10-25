import type { SlotId } from "../documents/data";
import type { VisitKey } from "../journey/data";
import type { PillTone } from "../ui/Pill";

export type ScanTab = "visit" | "bulk";

export const scanTabs: { id: ScanTab; label: string }[] = [
  { id: "visit", label: "Scan for a visit (reception)" },
  { id: "bulk", label: "Bulk scan (doctor's files)" },
];

export const scanVisits: { id: VisitKey; label: string }[] = [
  { id: "v1", label: "Visit 1" },
  { id: "v2", label: "Visit 2" },
  { id: "v3", label: "Visit 3" },
  { id: "fu", label: "3-month follow-up" },
];

/** Patients checked in today for visit 2/3: reception picks one of these first. */
export const todayScanQueue: { mrn: string; name: string; time: string; visit: VisitKey; waiting: number }[] = [
  { mrn: "VC-000142", name: "Laila Ahmed", time: "09:30", visit: "v2", waiting: 3 },
  { mrn: "VC-000118", name: "Nour Saleh", time: "10:15", visit: "fu", waiting: 1 },
  { mrn: "VC-000097", name: "Dina Farouk", time: "11:00", visit: "v3", waiting: 2 },
];

export interface ScannedPage {
  id: string;
  name: string;
  slot: SlotId;
  date: string;
}

export const sampleScanNames = ["Lab result", "Ultrasound report", "Imaging report", "Old prescription", "Referral letter"];

export type BulkStatus = "unsorted" | "assigned" | "saved";

export const bulkStatus: Record<BulkStatus, { label: string; tone: PillTone }> = {
  unsorted: { label: "Unsorted", tone: "neutral" },
  assigned: { label: "Assigned", tone: "amber" },
  saved: { label: "Saved to file", tone: "ok" },
};

export interface BulkFile {
  id: string;
  file: string;
  pages: number;
  /** Doctor's hint written on the folder/paper, helps reception match the patient. */
  hint: string;
  mrn: string;
  slot: SlotId | "";
  date: string;
  status: BulkStatus;
}

export const initialBulk: BulkFile[] = [
  { id: "b01", file: "scan_0412.pdf", pages: 3, hint: "Laila · labs 2023", mrn: "VC-000142", slot: "lab", date: "2023", status: "assigned" },
  { id: "b02", file: "scan_0413.pdf", pages: 1, hint: "Laila · ultrasound", mrn: "VC-000142", slot: "us", date: "May 2024", status: "saved" },
  { id: "b03", file: "scan_0414.pdf", pages: 5, hint: "Paper file · Rania", mrn: "", slot: "", date: "", status: "unsorted" },
  { id: "b04", file: "scan_0415.pdf", pages: 2, hint: "Rania · DEXA", mrn: "", slot: "", date: "", status: "unsorted" },
  { id: "b05", file: "scan_0416.pdf", pages: 1, hint: "Heba · mammogram", mrn: "", slot: "", date: "", status: "unsorted" },
  { id: "b06", file: "scan_0417.pdf", pages: 4, hint: "Heba · old notes", mrn: "VC-000131", slot: "paper", date: "2019–2022", status: "assigned" },
  { id: "b07", file: "scan_0418.pdf", pages: 2, hint: "Nour · hormone tests", mrn: "", slot: "", date: "", status: "unsorted" },
  { id: "b08", file: "scan_0419.pdf", pages: 1, hint: "No name", mrn: "", slot: "", date: "", status: "unsorted" },
];

/** Backlog files already sorted before this session (not in the mock list above). */
export const BACKLOG_TOTAL = 120;
export const BACKLOG_DONE_BEFORE = 32;
