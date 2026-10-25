import type { ContactChannel } from "@/features/emr/journey/data";
import type { AlertCounts, FormStatus } from "@/features/emr/ui/StatusPills";

export type PatientFilter = "all" | "today" | "red" | "meno" | "noform";

export const patientFilters: { id: PatientFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Seen today" },
  { id: "red", label: "Open red alerts" },
  { id: "meno", label: "Menopause module" },
  { id: "noform", label: "Form incomplete" },
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
  channel: ContactChannel;
  tags: Exclude<PatientFilter, "all">[];
}

export const patients: PatientRowData[] = [
  { name: "Laila Ahmed", age: 52, phone: "•••• 4821", mrn: "VC-000142", modules: "Menopause, discharge", alerts: { red: 1, amber: 2, reminder: 2 }, mrs: "18 severe", next: "Today 09:30", form: "complete", channel: "whatsapp", tags: ["red", "meno", "today"] },
  { name: "Nour Saleh", age: 47, phone: "•••• 3310", mrn: "VC-000118", modules: "Menopause", alerts: { amber: 1 }, mrs: "9 moderate", next: "Today 10:15", form: "complete", channel: "email", tags: ["meno", "today"] },
  { name: "Dina Farouk", age: 34, phone: "•••• 9902", mrn: "VC-000097", modules: "Bleeding, contraception", alerts: { red: 2 }, mrs: "—", next: "Today 11:00", form: "complete", channel: "whatsapp", tags: ["red", "today"] },
  { name: "Salma Nabil", age: 29, phone: "•••• 1187", mrn: "VC-000174", modules: "PCOS, acne or hair", alerts: {}, mrs: "—", next: "Today 11:45", form: "inProgress", channel: "whatsapp", tags: ["today", "noform"] },
  { name: "Heba Youssef", age: 58, phone: "•••• 5520", mrn: "VC-000131", modules: "Menopause (HRT review)", alerts: { amber: 1, reminder: 2 }, mrs: "7 mild", next: "Today 12:30", form: "notStarted", channel: "email", tags: ["meno", "today", "noform"] },
  { name: "Mona Adel", age: 41, phone: "•••• 7004", mrn: "VC-000156", modules: "Routine check-up", alerts: { reminder: 1 }, mrs: "—", next: "Today 13:15", form: "complete", channel: "phone", tags: ["today"] },
  { name: "Laila Ahmed", age: 44, phone: "•••• 7730", mrn: "VC-000203", modules: "Heavy bleeding", alerts: {}, mrs: "—", next: "21 Oct", form: "sent", channel: "whatsapp", tags: ["noform"] },
  { name: "Rania Mostafa", age: 49, phone: "•••• 2266", mrn: "VC-000189", modules: "Menopause, bladder", alerts: { amber: 3, reminder: 1 }, mrs: "14 moderate", next: "27 Oct", form: "complete", channel: "email", tags: ["meno"] },
];

export const totalPatients = 412;

/** Pure filter used by the list; keeps the client component free of logic. */
export function filterPatients(list: PatientRowData[], filter: PatientFilter, query: string) {
  const q = query.trim().toLowerCase();
  return list
    .filter((p) => filter === "all" || p.tags.includes(filter))
    .filter((p) => !q || `${p.name} ${p.mrn} ${p.phone}`.toLowerCase().includes(q));
}
