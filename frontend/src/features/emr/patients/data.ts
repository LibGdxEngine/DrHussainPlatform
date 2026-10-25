import type { AlertCounts, FormStatus } from "@/features/emr/ui/StatusPills";

export type PatientFilter = "all" | "today" | "red" | "meno" | "noform";

export const patientFilters: { id: PatientFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "today", label: "اتشافوا النهارده" },
  { id: "red", label: "تنبيهات حمراء مفتوحة" },
  { id: "meno", label: "قسم سن اليأس" },
  { id: "noform", label: "الاستمارة مش مكتملة" },
];

export interface PatientRowData {
  name: string;
  age: number;
  phone: string;
  mrn: string;
  modules: string;
  alerts: AlertCounts;
  mrs: string;
  next: string;
  form: FormStatus;
  tags: Exclude<PatientFilter, "all">[];
}

export const patients: PatientRowData[] = [
  { name: "ليلى أحمد", age: 52, phone: "•••• 4821", mrn: "VC-000142", modules: "سن اليأس، إفرازات", alerts: { red: 1, amber: 2, reminder: 2 }, mrs: "18 شديد", next: "النهارده 09:30", form: "complete", tags: ["red", "meno", "today"] },
  { name: "نور صالح", age: 47, phone: "•••• 3310", mrn: "VC-000118", modules: "سن اليأس", alerts: { amber: 1 }, mrs: "9 متوسط", next: "النهارده 10:15", form: "complete", tags: ["meno", "today"] },
  { name: "دينا فاروق", age: 34, phone: "•••• 9902", mrn: "VC-000097", modules: "نزيف، منع الحمل", alerts: { red: 2 }, mrs: "—", next: "النهارده 11:00", form: "complete", tags: ["red", "today"] },
  { name: "سلمى نبيل", age: 29, phone: "•••• 1187", mrn: "VC-000174", modules: "تكيس المبايض، حبوب أو شعر", alerts: {}, mrs: "—", next: "النهارده 11:45", form: "inProgress", tags: ["today", "noform"] },
  { name: "هبة يوسف", age: 58, phone: "•••• 5520", mrn: "VC-000131", modules: "سن اليأس (مراجعة HRT)", alerts: { amber: 1, reminder: 2 }, mrs: "7 بسيط", next: "النهارده 12:30", form: "notStarted", tags: ["meno", "today", "noform"] },
  { name: "منى عادل", age: 41, phone: "•••• 7004", mrn: "VC-000156", modules: "كشف دوري", alerts: { reminder: 1 }, mrs: "—", next: "النهارده 13:15", form: "complete", tags: ["today"] },
  { name: "ليلى أحمد", age: 44, phone: "•••• 7730", mrn: "VC-000203", modules: "نزيف غزير", alerts: {}, mrs: "—", next: "21 أكتوبر", form: "sent", tags: ["noform"] },
  { name: "رانيا مصطفى", age: 49, phone: "•••• 2266", mrn: "VC-000189", modules: "سن اليأس، المثانة", alerts: { amber: 3, reminder: 1 }, mrs: "14 متوسط", next: "27 أكتوبر", form: "complete", tags: ["meno"] },
];

export const totalPatients = 412;

/** Pure filter used by the list; keeps the client component free of logic. */
export function filterPatients(list: PatientRowData[], filter: PatientFilter, query: string) {
  const q = query.trim().toLowerCase();
  return list
    .filter((p) => filter === "all" || p.tags.includes(filter))
    .filter((p) => !q || `${p.name} ${p.mrn} ${p.phone}`.toLowerCase().includes(q));
}
