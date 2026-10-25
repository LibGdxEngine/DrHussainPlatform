export type SlotId = "lab" | "us" | "rad" | "path" | "paper" | "letter";

export interface DocSlot {
  id: SlotId;
  name: string;
  count: string;
  label: string;
  meta: string;
  /** Which visit the file belongs to and how it reached the clinic. */
  origin: string;
}

export const docSlots: DocSlot[] = [
  { id: "lab", name: "Lab results", count: "2", label: "Blood results · baseline panel", meta: "Sample 3 Oct 2026 · scanned 4 Oct by Mai Samir", origin: "Visit 2 · scanned at clinic" },
  { id: "us", name: "Ultrasound", count: "1", label: "Pelvic ultrasound", meta: "14 May 2024 · old report brought by the patient", origin: "Visit 1 · brought in by patient" },
  { id: "rad", name: "Other imaging", count: "1", label: "Bilateral mammogram", meta: "22 Jul 2022", origin: "Visit 1 · by email" },
  { id: "path", name: "Pathology", count: "0", label: "No pathology reports", meta: "Nothing scanned yet", origin: "—" },
  { id: "paper", name: "Old paper notes", count: "3", label: "Old clinic notes, page 1 of 3", meta: "2019–2023 · scanned 11 Oct", origin: "Doctor's old files · bulk scan" },
  { id: "letter", name: "Letters", count: "1", label: "GP referral letter", meta: "2 Oct 2026", origin: "First contact · by email" },
];

/** A tracked test as the key values panel shows it; built from the clinic's test catalog. */
export interface KeyValueDef {
  id: string;
  name: string;
  unit: string;
  /** Optimal-target bounds: value below `lo` or at/above `hi` is shaded. */
  lo: number | null;
  hi: number | null;
  optimal: string;
}

export function isOutOfRange(def: KeyValueDef, raw: string): boolean {
  const n = Number(raw);
  if (raw === "" || Number.isNaN(n)) return false;
  return (def.lo !== null && n < def.lo) || (def.hi !== null && n >= def.hi);
}
