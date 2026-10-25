import type {
  AuditTab,
  ClinicUser,
  PermissionCell,
  RolePermissionRow,
} from "./types";

export const auditTabs: { id: AuditTab; label: string }[] = [
  { id: "log", label: "Audit log" },
  { id: "users", label: "Users and permissions" },
];

/** Plain-English names for logged actions; anything not listed is shown as its code. */
const actionNames: Record<string, string> = {
  "auth.signin": "Signed in",
  "auth.signin_failed": "Sign-in failed",
  "auth.signin_blocked": "Sign-in blocked",
  "access.denied": "Refused: doctor only",
  "patient.created": "Created patient file",
  "patient.opened": "Opened patient file",
  "patient.updated": "Edited patient file",
  "patient.searched": "Searched patients",
  "document.uploaded": "Uploaded document",
  "document.opened": "Opened document",
  "document.updated": "Edited document details",
  "document.listed": "Viewed documents",
  "report.opened": "Opened results",
  "report.values_entered": "Entered key values",
  "report.confirmed": "Confirmed report belongs to patient",
  "report.reread": "Read report again",
  "results.history_viewed": "Viewed results history",
  "review_case.opened": "Opened results case",
  "review_case.edited": "Edited draft",
  "review_case.options_chosen": "Chose prescription or follow-up",
  "review_case.plan_chosen": "Chose smear plan",
  "review_case.drafted_anyway": "Drafted despite flags",
  "review_case.approved": "Approved and sent results email",
  "review_case.rejected": "Rejected results email",
  "patient_alert.acknowledged": "Acknowledged alert",
  "mail_thread.opened": "Opened email",
  "mail_thread.linked": "Filed email with patient",
  "mail_thread.replied": "Replied by email",
  "mail_attachment.opened": "Opened email attachment",
  "mail_attachment.saved": "Saved email attachment to file",
  "mailbox.updated": "Changed mailbox settings",
  "template.version_saved": "Saved email template",
  "template.approved": "Approved email template",
  "alert_rule.updated": "Edited alert rule",
  "prescription.created": "Added prescription",
  "prescription.updated": "Edited prescription",
  "lab_test.updated": "Edited lab test",
  "clinic_profile.updated": "Edited clinic details",
};

export function actionText(action: string): string {
  return actionNames[action] ?? action;
}

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
