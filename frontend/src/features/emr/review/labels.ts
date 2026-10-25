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
  mailbox_not_set_up: "The clinic mailbox is not set up yet (Inbox → Mailbox settings).",
};

export function caseFlag(code: string): string {
  return caseFlagText[code] ?? flagReason(code);
}

export const actionLabel: Record<string, string> = {
  opened: "Case opened",
  flagged: "Flagged for the doctor",
  drafted: "Draft built",
  plan_chosen: "Plan chosen",
  options_chosen: "Prescription or follow-up chosen",
  edited: "Draft edited",
  drafted_anyway: "Drafted despite flags",
  arabic_drafted: "Arabic draft built",
  approved: "Approved and sent",
  sent: "Delivered to the mail server",
  send_failed: "Sending failed",
  rejected: "Rejected",
  rerouted: "Report read again",
};
