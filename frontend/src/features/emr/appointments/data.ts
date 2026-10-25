import type { PillTone } from "../ui/Pill";

export type FormStatus = "complete" | "inProgress" | "notStarted" | "notSent";

export interface Appointment {
  id: string;
  time: string;
  name: string;
  type: string;
  form: FormStatus;
  sent: string;
  /** "checkin" records attendance; "send" sends/resends the form link. */
  action: "checkin" | "send";
  actionLabel: string;
}

export const formStatus: Record<FormStatus, { label: string; tone: PillTone }> = {
  complete: { label: "مكتملة", tone: "ok" },
  inProgress: { label: "جارية", tone: "amber" },
  notStarted: { label: "مبدأتش", tone: "neutral" },
  notSent: { label: "ما اتبعتتش", tone: "neutral" },
};

export const appointments: Appointment[] = [
  { id: "0930", time: "09:30", name: "ليلى أحمد", type: "جديدة · سن اليأس، إفرازات", form: "complete", sent: "اتبعت 8 أكتوبر", action: "checkin", actionLabel: "تسجيل حضور" },
  { id: "1015", time: "10:15", name: "نور صالح", type: "متابعة · 3 شهور", form: "complete", sent: "اتبعت 9 أكتوبر", action: "checkin", actionLabel: "تسجيل حضور" },
  { id: "1100", time: "11:00", name: "دينا فاروق", type: "جديدة · نزيف، منع الحمل", form: "complete", sent: "اتبعت 10 أكتوبر", action: "checkin", actionLabel: "تسجيل حضور" },
  { id: "1145", time: "11:45", name: "سلمى نبيل", type: "جديدة · تكيس المبايض", form: "inProgress", sent: "اتبعت 11 أكتوبر · اتفتح", action: "send", actionLabel: "ابعت تذكير" },
  { id: "1230", time: "12:30", name: "هبة يوسف", type: "مراجعة HRT سنوية", form: "notStarted", sent: "اتبعت 10 أكتوبر · ما اتفتحش", action: "send", actionLabel: "ابعت اللينك تاني" },
  { id: "1315", time: "13:15", name: "منى عادل", type: "كشف دوري / مسحة", form: "complete", sent: "اتبعت 9 أكتوبر", action: "checkin", actionLabel: "تسجيل حضور" },
  { id: "1400", time: "14:00", name: "رانيا مصطفى", type: "متابعة · 6 شهور", form: "notSent", sent: "اتحجزت النهارده", action: "send", actionLabel: "ابعت لينك الاستمارة" },
];

export const days: { weekday: string; date: string }[] = [
  { weekday: "الثلاثاء", date: "13" },
  { weekday: "الأربع", date: "14" },
  { weekday: "الخميس", date: "15" },
  { weekday: "السبت", date: "17" },
  { weekday: "الحد", date: "18" },
];

export const visitTypes = ["مريضة جديدة (استمارة أساسية)", "متابعة (استمارة قصيرة)", "كشف دوري / مسحة"];
