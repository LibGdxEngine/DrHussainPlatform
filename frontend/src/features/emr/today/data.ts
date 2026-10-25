import { emrRoutes } from "@/features/emr/routes";
import type { AlertCounts, FormStatus } from "@/features/emr/ui/StatusPills";

export interface TodayStat {
  title: string;
  value: number;
  caption: string;
  href: string;
  /** The first card is the dark "needs attention" card. */
  highlight?: boolean;
}

export const todayStats: TodayStat[] = [
  { title: "تنبيهات حمراء محتاجة تأكيد", value: 3, caption: "في حالتين النهارده", href: emrRoutes.visit, highlight: true },
  { title: "استمارات لسه مبدأتش", value: 3, caption: "اتبعت تذكير الساعة 08:00", href: emrRoutes.today },
  { title: "ردود المرضى", value: 2, caption: "أقدم رد من يوم", href: emrRoutes.visit },
  { title: "فحوصات محتاجة قيم أساسية", value: 3, caption: "اتسحبت سكان النهارده", href: emrRoutes.visit },
];

export interface WeekDay {
  label: string;
  count: number;
  kind: "past" | "today" | "future";
}

export const weekDays: WeekDay[] = [
  { label: "س", count: 7, kind: "past" },
  { label: "ح", count: 11, kind: "past" },
  { label: "ن", count: 8, kind: "past" },
  { label: "ث", count: 9, kind: "today" },
  { label: "ر", count: 12, kind: "future" },
  { label: "خ", count: 6, kind: "future" },
];

export interface TodayVisit {
  time: string;
  name: string;
  age: number;
  visit: string;
  form: FormStatus;
  alerts: AlertCounts;
  noAlertsText?: string;
  mrs: string;
  mrsNote: string;
  mrsHot?: boolean;
  actionLabel: string;
  href: string;
}

export const todayVisits: TodayVisit[] = [
  { time: "09:30", name: "ليلى أحمد", age: 52, visit: "جديدة · سن اليأس، إفرازات", form: "complete", alerts: { red: 1, amber: 2 }, mrs: "18", mrsNote: "شديد", mrsHot: true, actionLabel: "افتح", href: emrRoutes.visit },
  { time: "10:15", name: "نور صالح", age: 47, visit: "متابعة · سن اليأس (3 شهور)", form: "complete", alerts: { amber: 1 }, mrs: "9", mrsNote: "↓ من 21", actionLabel: "افتح", href: emrRoutes.visit },
  { time: "11:00", name: "دينا فاروق", age: 34, visit: "جديدة · نزيف، منع الحمل", form: "complete", alerts: { red: 2 }, mrs: "—", mrsNote: "", actionLabel: "افتح", href: emrRoutes.visit },
  { time: "11:45", name: "سلمى نبيل", age: 29, visit: "جديدة · تكيس المبايض، حبوب أو شعر", form: "inProgress", alerts: {}, noAlertsText: "لسه مفيش", mrs: "—", mrsNote: "", actionLabel: "افتح", href: emrRoutes.visit },
  { time: "12:30", name: "هبة يوسف", age: 58, visit: "مراجعة HRT سنوية", form: "notStarted", alerts: { reminder: 2 }, mrs: "7", mrsNote: "آخر زيارة", actionLabel: "ابعت اللينك تاني", href: emrRoutes.patients },
  { time: "13:15", name: "منى عادل", age: 41, visit: "كشف دوري / مسحة", form: "complete", alerts: {}, noAlertsText: "مفيش", mrs: "—", mrsNote: "", actionLabel: "افتح", href: emrRoutes.visit },
];

export interface PatientReply {
  initial: string;
  title: string;
  excerpt: string;
  tone: "brand" | "amber";
}

export const patientReplies: PatientReply[] = [
  { initial: "ل", title: "ليلى أحمد · 12 أكتوبر", excerpt: "\"شكراً يا دكتور. أبدأ مكمّل حديد؟\"", tone: "brand" },
  { initial: "ن", title: "نور صالح · 11 أكتوبر", excerpt: "\"اللزقة بتقع بالليل على طول.\"", tone: "amber" },
];

export const reminders: { code: string; text: string }[] = [
  { code: "R36", text: "ماموجرام متأخر · 4 مريضات" },
  { code: "R39", text: "Lp(a) عمره ما اتعمل · 6 مريضات" },
  { code: "R40", text: "مراجعة HRT السنوية · 3 مريضات" },
  { code: "R38", text: "لولب هرموني عدّى 5 سنين · مريضة" },
];
