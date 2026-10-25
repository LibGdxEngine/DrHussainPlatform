export type SlotId = "lab" | "us" | "rad" | "path" | "paper" | "letter";

export interface DocSlot {
  id: SlotId;
  name: string;
  count: string;
  label: string;
  meta: string;
}

export const docSlots: DocSlot[] = [
  { id: "lab", name: "نتايج التحاليل", count: "2", label: "نتايج الدم · مبدئي – الكل", meta: "العينة 3 أكتوبر 2026 · اتعمل سكان 4 أكتوبر بواسطة مي سمير" },
  { id: "us", name: "سونار", count: "1", label: "سونار حوض", meta: "14 مايو 2024 · تقرير قديم جابته المريضة" },
  { id: "rad", name: "أشعة تانية", count: "1", label: "ماموجرام للناحيتين", meta: "22 يوليو 2022" },
  { id: "path", name: "باثولوجي", count: "0", label: "مفيش تقارير باثولوجي", meta: "لسه مفيش سكان" },
  { id: "paper", name: "ملاحظات ورق قديمة", count: "3", label: "ملاحظات العيادة القديمة، صفحة 1 من 3", meta: "2019–2023 · اتعمل سكان 11 أكتوبر" },
  { id: "letter", name: "جوابات", count: "1", label: "جواب تحويل من الممارس العام", meta: "2 أكتوبر 2026" },
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
  { id: "e2", name: "Estradiol", unit: "pg/mL", lo: null, hi: null, optimal: "مش منطبق", lab: "<30 بعد الانقطاع" },
  { id: "testo", name: "Testosterone, total", unit: "ng/dL", lo: null, hi: 50, optimal: "<50 مع العلاج", lab: "8–60" },
  { id: "hba1c", name: "HbA1c", unit: "%", lo: null, hi: 5.4, optimal: "<5.4", lab: "4.0–5.6" },
  { id: "ldl", name: "LDL", unit: "mmol/L", lo: null, hi: null, optimal: "حسب خطر القلب", lab: "<3.0" },
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
