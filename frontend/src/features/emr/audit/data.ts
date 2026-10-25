import type {
  AuditRow,
  AuditTab,
  ClinicUser,
  PermissionCell,
  RolePermissionRow,
} from "./types";

export const auditTabs: { id: AuditTab; label: string }[] = [
  { id: "log", label: "Audit log" },
  { id: "users", label: "Users and permissions" },
];

export const periodOptions = ["Last 7 days", "Today", "Last 30 days"];
export const userFilterOptions = ["All users", "Dr. H. Gohar", "Mai Samir", "Patients"];
export const actionFilterOptions = ["All actions", "View", "Edit", "Acknowledge alert", "Send", "Denied"];

export const auditRows: AuditRow[] = [
  { time: "13 Oct 09:41", who: "Dr. H. Gohar", role: "Doctor", action: "Acknowledged alert", patient: "VC-000142", details: 'R7 · Reason: "TVUS booked before treatment"', outcome: "success" },
  { time: "13 Oct 09:38", who: "Dr. H. Gohar", role: "Doctor", action: "Opened visit summary", patient: "VC-000142", details: "Summary, Menopause tab", outcome: "success" },
  { time: "13 Oct 09:20", who: "Mai Samir", role: "Clinic staff", action: "Opened alerts", patient: "VC-000142", details: "Staff role is not allowed to view clinical alerts", outcome: "denied" },
  { time: "13 Oct 09:12", who: "Mai Samir", role: "Clinic staff", action: "Entered key values", patient: "VC-000142", details: "Ferritin 32, HbA1c 5.3, TSH 1.8 · from 3 Oct scan", outcome: "success" },
  { time: "12 Oct 21:04", who: "Laila Ahmed", role: "Patient", action: "Replied to email", patient: "VC-000142", details: 'Thread "Blood results" · saved to record', outcome: "success" },
  { time: "12 Oct 18:30", who: "Nour Saleh", role: "Patient", action: "Submitted follow-up form", patient: "VC-000118", details: "MRS 9 · signed in with link + code", outcome: "success" },
  { time: "12 Oct 11:02", who: "Dr. H. Gohar", role: "Doctor", action: "Edited alert rule", patient: "Clinic settings", details: "Mammogram interval set for R36 · R16 unchanged", outcome: "success" },
  { time: "11 Oct 09:52", who: "Dr. H. Gohar", role: "Doctor", action: "Sent lab request", patient: "VC-000142", details: "Baseline – full panel + hormones · emailed to lab", outcome: "success" },
];

export const outcomeLabel = { success: "Success", denied: "Denied" } as const;

const YES: PermissionCell = { text: "Yes", tone: "yes" };
const NO: PermissionCell = { text: "No", tone: "no" };
const OWN: PermissionCell = { text: "Own only", tone: "own" };
const READ_ONLY: PermissionCell = { text: "Read only", tone: "readOnly" };
const NA: PermissionCell = { text: "—", tone: "na" };

const row = (
  action: string,
  doctor: PermissionCell,
  nurse: PermissionCell,
  staff: PermissionCell,
  patient: PermissionCell,
): RolePermissionRow => ({ action, doctor, nurse, staff, patient });

export const rolePermissions: RolePermissionRow[] = [
  row("Book visits, send form links", YES, NO, YES, NO),
  row("Check-in and vital signs", YES, YES, NO, NO),
  row("Scan, label, enter key values", YES, YES, YES, NO),
  row("View summary, alerts and scores", YES, READ_ONLY, NO, NO),
  row("Acknowledge alerts, write prescriptions", YES, NO, NO, NO),
  row("Send pre-written orders", YES, YES, YES, NO),
  row("Email results, read replies", YES, NO, NO, OWN),
  row("Fill in forms, view their scores", NA, NO, NO, OWN),
  row("Clinic settings, audit log", YES, NO, NO, NO),
];

export const clinicUsers: ClinicUser[] = [
  {
    id: "doctor",
    name: "Dr. Hussain Gohar",
    email: "hsgohar@gmail.com",
    roleLabel: "Doctor · Admin",
    roleTone: "brand",
    avatar: { kind: "photo" },
    meta: { kind: "text", text: "Passkey · now" },
  },
  {
    id: "staff",
    name: "Mai Samir",
    email: "clinicgohar@gmail.com",
    roleLabel: "Clinic staff",
    roleTone: "neutral",
    avatar: { kind: "initial", letter: "M", className: "bg-warn-tint text-warn-ink" },
    meta: { kind: "text", text: "Authenticator app · 09:20" },
  },
  {
    id: "nurse",
    name: "Sara Mahmoud",
    email: "nurse.vclinic@gmail.com",
    roleLabel: "Nurse",
    roleTone: "brand",
    avatar: { kind: "initial", letter: "S", className: "bg-brand-tint text-brand-deep" },
    meta: { kind: "inviteLink", text: "Invite pending · edit permissions" },
  },
];

export const patientsNote =
  "Patients do not have staff accounts. They open a one-time form link and verify with date of birth + an SMS code; they only see their own forms, results and emails.";
