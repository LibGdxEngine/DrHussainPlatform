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
  { title: "Red alerts to confirm", value: 3, caption: "Across 2 visits today", href: emrRoutes.visit, highlight: true },
  { title: "Forms not started", value: 3, caption: "Reminder sent at 08:00", href: emrRoutes.today },
  { title: "Patient replies", value: 2, caption: "Oldest from 1 day ago", href: emrRoutes.visit },
  { title: "Results needing key values", value: 3, caption: "Scanned today", href: emrRoutes.visit },
];

export interface WeekDay {
  label: string;
  count: number;
  kind: "past" | "today" | "future";
}

export const weekDays: WeekDay[] = [
  { label: "Sat", count: 7, kind: "past" },
  { label: "Sun", count: 11, kind: "past" },
  { label: "Mon", count: 8, kind: "past" },
  { label: "Tue", count: 9, kind: "today" },
  { label: "Wed", count: 12, kind: "future" },
  { label: "Thu", count: 6, kind: "future" },
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
  { time: "09:30", name: "Laila Ahmed", age: 52, visit: "New · Menopause, discharge", form: "complete", alerts: { red: 1, amber: 2 }, mrs: "18", mrsNote: "Severe", mrsHot: true, actionLabel: "Open", href: emrRoutes.visit },
  { time: "10:15", name: "Nour Saleh", age: 47, visit: "Follow-up · Menopause (3 months)", form: "complete", alerts: { amber: 1 }, mrs: "9", mrsNote: "↓ from 21", actionLabel: "Open", href: emrRoutes.visit },
  { time: "11:00", name: "Dina Farouk", age: 34, visit: "New · Bleeding, contraception", form: "complete", alerts: { red: 2 }, mrs: "—", mrsNote: "", actionLabel: "Open", href: emrRoutes.visit },
  { time: "11:45", name: "Salma Nabil", age: 29, visit: "New · PCOS, acne or hair", form: "inProgress", alerts: {}, noAlertsText: "None yet", mrs: "—", mrsNote: "", actionLabel: "Open", href: emrRoutes.visit },
  { time: "12:30", name: "Heba Youssef", age: 58, visit: "Annual HRT review", form: "notStarted", alerts: { reminder: 2 }, mrs: "7", mrsNote: "Last visit", actionLabel: "Resend link", href: emrRoutes.patients },
  { time: "13:15", name: "Mona Adel", age: 41, visit: "Well-woman check / smear", form: "complete", alerts: {}, noAlertsText: "None", mrs: "—", mrsNote: "", actionLabel: "Open", href: emrRoutes.visit },
];

export interface PatientReply {
  initial: string;
  title: string;
  excerpt: string;
  tone: "brand" | "amber";
}

export const patientReplies: PatientReply[] = [
  { initial: "L", title: "Laila Ahmed · 12 Oct", excerpt: "\"Thank you, doctor. Should I start an iron supplement?\"", tone: "brand" },
  { initial: "N", title: "Nour Saleh · 11 Oct", excerpt: "\"The patch keeps falling off at night.\"", tone: "amber" },
];

export const reminders: { code: string; text: string }[] = [
  { code: "R36", text: "Mammogram overdue · 4 patients" },
  { code: "R39", text: "Lp(a) never tested · 6 patients" },
  { code: "R40", text: "Annual HRT review · 3 patients" },
  { code: "R38", text: "Hormonal IUD past 5 years · 1 patient" },
];

export interface UpcomingFollowup {
  name: string;
  due: string;
  lastVisit: string;
  overdue?: boolean;
}

/** Files reception still has to scan for today's visit 2/3 patients. */
export const filesAwaitingScan = 6;

/** Patients reaching the 3-month follow-up after their last visit. */
export const upcomingFollowups: UpcomingFollowup[] = [
  { name: "Rania Mostafa", due: "5 days overdue", lastVisit: "Last visit 8 Jul", overdue: true },
  { name: "Nour Saleh", due: "Today", lastVisit: "Last visit 14 Jul" },
  { name: "Mona Adel", due: "20 Oct", lastVisit: "Last visit 20 Jul" },
  { name: "Heba Youssef", due: "2 Nov", lastVisit: "Last visit 2 Aug" },
];
