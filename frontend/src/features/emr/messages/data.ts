import { ApiError } from "@/lib/api/emr/errors";
import { THIRD_PARTY_CONFIRM, type MailFilter, type MailFolder, type MailSecurity, type MailThread } from "@/lib/api/emr/mail";

/** A link or reply was refused because the sender is not the patient and needs confirming. */
export function isThirdPartyConfirm(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === THIRD_PARTY_CONFIRM;
}

/** Linking a third party needs who they are to the patient and an explicit tick. */
export function canConfirmThirdParty(relation: string, confirmed: boolean): boolean {
  return confirmed && relation.trim().length > 0;
}

/**
 * Whether a reply from the inbox needs the doctor's tick before it is sent. A thread linked as a third
 * party (with a relation) is with someone other than the patient. A thread marked third party only
 * because a relative wrote in the patient's own thread still replies to the patient's address, so it
 * asks only if the server refuses (THIRD_PARTY_CONFIRM).
 */
export function replyNeedsConfirmation(
  t: Pick<MailThread, "third_party" | "third_party_relation">, refused: boolean,
): boolean {
  return refused || (t.third_party && t.third_party_relation.trim().length > 0);
}

/** Where a thread sits for the list label: a relative writing in, the patient, a sent email with no reply yet, or no file. */
export type ThreadOrigin = "third_party" | "patient" | "sent" | "unfiled";

export function threadOrigin(t: Pick<MailThread, "patient" | "third_party" | "has_inbound">): ThreadOrigin {
  if (!t.patient) return "unfiled";
  if (t.third_party) return "third_party";
  return t.has_inbound ? "patient" : "sent";
}

export const folders: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "archive", label: "Archive" },
];

export const inboxFilters: { id: MailFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "patients", label: "Patients" },
  { id: "unmatched", label: "Not matched" },
];

export const securityOptions: { id: MailSecurity; label: string }[] = [
  { id: "ssl", label: "SSL/TLS" },
  { id: "starttls", label: "STARTTLS" },
  { id: "none", label: "None (local test server only)" },
];

/** "13 Oct" for this year, "13 Oct 2025" otherwise; "14:05" for today. */
export function mailDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function initialOf(name: string, email: string) {
  return (name || email || "?").trim().charAt(0).toUpperCase();
}
