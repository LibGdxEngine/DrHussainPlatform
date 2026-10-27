import type { MemberRole } from "@/lib/api/emr/staff";
import type { AuditTab } from "./types";

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
  "member.role_changed": "Changed a user's role",
  "member.removed": "Removed a user",
  "invitation.created": "Invited a user",
  "invitation.revoked": "Withdrew an invitation",
  "invitation.accepted": "Joined the clinic",
};

export function actionText(action: string): string {
  return actionNames[action] ?? action;
}

export const outcomeLabel = { success: "Success", denied: "Denied" } as const;

/** The clinic roles as the backend applies them (IsClinicLead = owner or admin). */
export const roleInfo: Record<MemberRole, { label: string; short: string; can: string[]; cannot?: string[] }> = {
  OWNER: {
    label: "Owner",
    short: "Doctor access, and manages owners",
    can: [
      "Everything an admin can do",
      "Make other users owners, or remove an owner",
    ],
    cannot: ["The clinic always keeps at least one owner"],
  },
  ADMIN: {
    label: "Admin",
    short: "Doctor access",
    can: [
      "Write prescriptions and lab requests",
      "Review results, approve or reject results emails",
      "Acknowledge alerts and confirm whose report a flagged upload is",
      "Reply to patients' emails",
      "Clinic settings: details, templates, leaflets, lab tests, alert rules and the mailbox",
      "Read the audit log",
      "Invite users, change roles and remove users",
    ],
  },
  MEMBER: {
    label: "Member",
    short: "Clinic staff",
    can: [
      "Patients: create, open and edit files",
      "Appointments, and sending patient forms",
      "Scanning and filing documents, and entering key values from reports",
      "Read the inbox, alerts, orders and clinic settings",
      "See the list of users",
    ],
    cannot: ["Issue orders, approve results emails, change settings or read the audit log"],
  },
};

export const roleOrder: MemberRole[] = ["OWNER", "ADMIN", "MEMBER"];

export interface MemberControls {
  /** Roles the signed-in user may pick for this member; empty when the role can't be changed here. */
  roleOptions: MemberRole[];
  canRemove: boolean;
}

/**
 * What the signed-in user may do to a member, mirroring the backend: only owners and admins change users,
 * only owners touch owners, and nobody removes or re-roles themselves from this list.
 */
export function memberControls(
  me: { role: MemberRole; is_lead: boolean } | null,
  member: { role?: MemberRole; is_me: boolean },
): MemberControls {
  const none: MemberControls = { roleOptions: [], canRemove: false };
  if (!me?.is_lead || member.is_me) return none;
  const owner = me.role === "OWNER";
  if (member.role === "OWNER" && !owner) return none;
  return { roleOptions: owner ? roleOrder : ["ADMIN", "MEMBER"], canRemove: true };
}

export const patientsNote =
  "Patients do not have staff accounts. They open a one-time form link and confirm their date of birth; they only see their own form.";
