import type { MailFilter, MailFolder, MailSecurity } from "@/lib/api/emr/mail";

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
