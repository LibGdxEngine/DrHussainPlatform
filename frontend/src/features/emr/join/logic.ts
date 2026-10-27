import type { JoinPreview } from "@/lib/api/emr/staff";

/** Why an invitation can't be accepted, in words for the invited person; null while it is open. */
export function invitationProblem(status: JoinPreview["status"] | "NOT_FOUND" | "NO_TOKEN"): { title: string; message: string } | null {
  switch (status) {
    case "PENDING":
      return null;
    case "ACCEPTED":
      return { title: "This invitation was already used", message: "If it was you, sign in to open the EMR." };
    case "DECLINED":
      return { title: "This invitation was withdrawn", message: "Ask the clinic to send you a new invitation." };
    case "EXPIRED":
      return { title: "This invitation has expired", message: "Ask the clinic to send you a new invitation." };
    case "NO_TOKEN":
      return { title: "This link is incomplete", message: "Open the link exactly as it was sent to you, or ask the clinic to send it again." };
    default:
      return { title: "This invitation link is not valid", message: "Check that you opened the whole link, or ask the clinic for a new invitation." };
  }
}

export interface SignupDraft {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  confirm: string;
}

/** Checks done before sending the sign-up (the server checks the rest, such as the phone number). */
export function signupProblem(d: SignupDraft): string | null {
  if (!d.firstName.trim()) return "Enter your first name.";
  if (!d.lastName.trim()) return "Enter your last name.";
  if (!d.phone.trim()) return "Enter your mobile number. The code is sent to it by WhatsApp.";
  if (d.password.length < 8) return "Choose a password of at least 8 characters.";
  if (d.password !== d.confirm) return "The two passwords do not match.";
  return null;
}

/** Every message in a validation error (form-wide first), or the error's own message. */
export function errorLines(err: { message: string; fields?: Record<string, string[]> }): string[] {
  const fields = err.fields ?? {};
  const keys = Object.keys(fields).sort((a, b) => Number(b === "non_field_errors") - Number(a === "non_field_errors"));
  const lines = keys.flatMap((k) => fields[k]);
  return lines.length ? lines : [err.message];
}

/** Only digits, as typed into the code box. */
export const codeDigits = (value: string, max = 8) => value.replace(/\D/g, "").slice(0, max);
