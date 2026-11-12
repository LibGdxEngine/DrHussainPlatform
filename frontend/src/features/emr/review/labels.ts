import type { PillTone } from "../ui/Pill";
import type { CaseStatus, QueueGroup } from "@/lib/api/emr/review";
import { flagReason } from "../results/labels";

export const caseStatus: Record<CaseStatus, { label: string; tone: PillTone }> = {
  flagged: { label: "Needs the doctor", tone: "red" },
  awaiting_plan: { label: "Doctor to choose the plan", tone: "red" },
  drafted: { label: "Draft ready", tone: "amber" },
  sending: { label: "Sending", tone: "brand" },
  sent: { label: "Sent", tone: "ok" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const queueGroups: { id: QueueGroup; label: string }[] = [
  { id: "needs_doctor", label: "Needs the doctor" },
  { id: "ready", label: "Drafts to approve" },
  { id: "sent", label: "Sent" },
  { id: "rejected", label: "Rejected" },
];

export const routeLabel: Record<string, string> = {
  results: "Normal results email",
  menopause: "Menopause results email",
  follow_up: "Follow-up comparison",
  infection: "STI results email",
  pathology: "Pathology results email",
  smear: "Cervical smear email",
  reply: "Reply about a prescription",
};

const caseFlagText: Record<string, string> = {
  template_not_approved: "The template for this email has no approved wording yet (Clinic settings → Email templates).",
  phrase_not_approved: "A system phrase this email uses has no approved English wording yet (Clinic settings → Email templates → System phrases).",
  mailbox_not_set_up: "The clinic mailbox is not set up yet (Inbox → Mailbox settings).",
  red_alert_open: "An open red alert from the patient's form answers is waiting. Review and acknowledge it to continue.",
  alert_rules_not_checked: "The alert rules have not been checked on the patient's latest form, or the check had errors. Run “Check alerts now” on the patient's visit, then reopen this case.",
  uncertain_value: "Some values need checking before they are used. Confirm or correct each value marked “Check this value”.",
  unreadable_value: "A value could not be read. Confirm it as read (it is then shown as not read in the email) or correct it, with “Check this value”.",
  peanut_allergy_prometrium: "The patient's form records a peanut allergy and a chosen prescription matches the medicine names on that alert rule. Check the prescription before sending.",
};

/** Why a case waits for the doctor, or a warning shown on it, in plain words. */
export function caseFlag(code: string): string {
  if (caseFlagText[code]) return caseFlagText[code];
  if (code.startsWith("red_alert_")) return `Red alert rule ${code.slice("red_alert_".length)} fired on these results. Acknowledge it to continue.`;
  return flagReason(code);
}

export const actionLabel: Record<string, string> = {
  opened: "Case opened",
  flagged: "Flagged for the doctor",
  drafted: "Draft built",
  plan_chosen: "Plan chosen",
  options_chosen: "Prescription or follow-up chosen",
  edited: "Draft edited",
  drafted_anyway: "Drafted despite flags",
  arabic_drafted: "Arabic wording saved",
  approved: "Approved and sent",
  sent: "Delivered to the mail server",
  send_failed: "Sending failed",
  rejected: "Rejected",
  rerouted: "Report read again",
};
