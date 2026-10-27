export type SlotId = "lab" | "us" | "rad" | "path" | "paper" | "letter";

export interface DocSlot {
  id: SlotId;
  name: string;
}

export const docSlots: DocSlot[] = [
  { id: "lab", name: "Lab results" },
  { id: "us", name: "Ultrasound" },
  { id: "rad", name: "Other imaging" },
  { id: "path", name: "Pathology" },
  { id: "paper", name: "Old paper notes" },
  { id: "letter", name: "Letters" },
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
