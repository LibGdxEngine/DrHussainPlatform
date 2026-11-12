import type { DuplicateMatch, SimilarPatient } from "@/lib/api/emr/patients";

/** Form fields that have their own error line; anything else the server rejects is shown above the button. */
export const PATIENT_FIELDS = [
  "full_name",
  "full_name_ar",
  "date_of_birth",
  "mobile",
  "whatsapp",
  "email",
  "referring_doctor",
  "first_contact_channel",
  "preferred_language",
] as const;

/** Server errors for fields the form does not show (and non-field errors), so none is swallowed. */
export function unplacedErrors(fields: Record<string, string[]>, shown: readonly string[] = PATIENT_FIELDS): string[] {
  return Object.entries(fields)
    .filter(([key]) => !shown.includes(key))
    .flatMap(([key, messages]) => (key === "non_field_errors" ? messages : messages.map((m) => `${key.replace(/_/g, " ")}: ${m}`)));
}

export type PreferredLanguage = "en" | "ar";

/** The language the patient's emails are written in. */
export const languageOptions: { id: PreferredLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ar", label: "Arabic" },
];

export const duplicateHeading: Record<DuplicateMatch, string> = {
  exact: "Already registered with the same name and date of birth:",
  near: "Already registered with a very similar name and the same date of birth:",
};

export const duplicateLabel: Record<DuplicateMatch, string> = {
  exact: "Same name",
  near: "Similar name",
};

/** The overall match is exact if any file is; the server's `match` wins when it is present. */
export function overallMatch(similar: SimilarPatient[], match?: DuplicateMatch): DuplicateMatch {
  return match ?? (similar.some((p) => p.match === "exact") ? "exact" : "near");
}
