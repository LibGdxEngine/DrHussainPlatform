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

export type KvId = "ferr" | "e2" | "testo" | "hba1c" | "ldl" | "tsh";

export interface KeyValueDef {
  id: KvId;
  name: string;
  unit: string;
  /** Ideal-range bounds: value below `lo` or at/above `hi` is shaded. */
  lo: number | null;
  hi: number | null;
  optimal: string;
  lab: string;
}

export const keyValues: KeyValueDef[] = [
  { id: "ferr", name: "Ferritin", unit: "ng/mL", lo: 50, hi: 150, optimal: "50–150", lab: "13–150" },
  { id: "e2", name: "Estradiol", unit: "pg/mL", lo: null, hi: null, optimal: "N/A", lab: "<30 postmenopausal" },
  { id: "testo", name: "Testosterone, total", unit: "ng/dL", lo: null, hi: 50, optimal: "<50 on treatment", lab: "8–60" },
  { id: "hba1c", name: "HbA1c", unit: "%", lo: null, hi: 5.4, optimal: "<5.4", lab: "4.0–5.6" },
  { id: "ldl", name: "LDL", unit: "mmol/L", lo: null, hi: null, optimal: "Per cardiovascular risk", lab: "<3.0" },
  { id: "tsh", name: "TSH", unit: "mIU/L", lo: 1, hi: 2.5, optimal: "1–2.5", lab: "0.4–4.0" },
];

export const initialKv: Record<KvId, string> = {
  ferr: "32", e2: "18", testo: "22", hba1c: "5.3", ldl: "3.9", tsh: "1.8",
};

export function isOutOfRange(def: KeyValueDef, raw: string): boolean {
  const n = Number(raw);
  if (raw === "" || Number.isNaN(n)) return false;
  return (def.lo !== null && n < def.lo) || (def.hi !== null && n >= def.hi);
}
