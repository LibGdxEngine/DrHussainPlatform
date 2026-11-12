import type { CheckReason, InvestigationReport, ResultComparison, ResultValue } from "@/lib/api/emr/results";

export const reportTypeLabel: Record<InvestigationReport["report_type"], string> = {
  bloods: "Blood tests",
  menopause_bloods: "Menopause / perimenopause bloods",
  infection: "Infections and STIs",
  pathology: "Pathology report",
  smear_normal: "Cervical smear, normal",
  smear_abnormal: "Cervical smear, abnormal",
  unknown: "Not recognised",
};

export const statusLabel: Record<InvestigationReport["status"], string> = {
  pending: "Reading…",
  parsed: "Read",
  flagged: "Needs the doctor",
  confirmed: "Checked by the doctor",
  failed: "Could not be read",
};

/** Why a report needs the doctor, in the words staff see. Unknown codes fall back to the code. */
const flagText: Record<string, string> = {
  unreadable_document: "The file could not be opened as a report.",
  no_text_found: "No text could be read from the file.",
  ocr_unavailable: "Scanned reports cannot be read on this server yet.",
  too_many_pages: "The file has too many pages to read automatically.",
  read_timed_out: "Reading the file took too long. Try again, or type the key values in.",
  image_too_large: "The scan is too large to read. Upload a smaller image or a PDF.",
  unknown_report_type: "The kind of report is not clear.",
  no_results_found: "No results were found in the report.",
  unreadable_value: "Some values could not be read.",
  missing_result_date: "The sample date is missing.",
  smear_result_unclear: "The smear result is not clear.",
  patient_identifiers_missing: "The report does not show the patient's name, date of birth or file number.",
  patient_other_file: "The report names a different patient in the clinic.",
  patient_missing_date_of_birth: "The report has no date of birth to confirm the patient.",
  patient_missing_second_identifier: "The date of birth is not backed by a name or file number.",
  patient_file_number_date_of_birth_mismatch: "The file number and date of birth do not agree.",
  patient_name_mismatch: "The name on the report differs from this file.",
  patient_name_date_of_birth_mismatch: "The name and date of birth do not match this file.",
  patient_unknown_file_number: "The file number on the report is not in the clinic.",
  patient_ambiguous: "More than one file has this name and date of birth.",
  patient_not_found: "No file in the clinic has the date of birth on the report.",
  uncertain_value: "Some values were read with doubt. Check each one marked “Check this value”.",
};

/** Why one value was read with doubt (ResultValue.check_reason). */
const checkReasonText: Record<CheckReason, string> = {
  value_glued: "The value ran into the text next to it.",
  ambiguous_comma: "A comma could be a decimal point or a thousands separator.",
  ref_leftover: "Part of the reference range may have been read as the value.",
  unit_missing: "No unit was found next to the value.",
  name_unknown: "The test name is not in the catalog.",
  split_line: "The test was split across two lines.",
  ocr_low_confidence: "The scan was hard to read here.",
};

export function checkReasonLabel(reason: string | undefined): string {
  if (!reason) return "The value was read with doubt.";
  return checkReasonText[reason as CheckReason] ?? reason.replaceAll("_", " ");
}

/** The value still waits for the doctor's check. */
export function needsCheck(value: Pick<ResultValue, "needs_check" | "checked_at">): boolean {
  return Boolean(value.needs_check) && !value.checked_at;
}

/** What fired an alert (PatientAlert.source). */
const alertSourceText: Record<string, string> = {
  lab: "From lab results",
  vital: "From an examination",
  answer: "From the patient's form answers",
};

export function alertSourceLabel(source: string): string {
  return alertSourceText[source] ?? source;
}

/** Remarks on a comparison that still stands, e.g. the earlier result came from another lab. */
export function comparisonNotes(comparison: Pick<ResultComparison, "notes" | "labs">): string[] {
  return comparison.notes.map((note) => {
    if (note !== "lab_differs") return note.replaceAll("_", " ");
    const [now, before] = comparison.labs;
    return now && before ? `Different lab: ${now} now, ${before} before` : "Different lab";
  });
}

export function flagReason(code: string): string {
  return flagText[code] ?? code.replaceAll("_", " ");
}

const notComparableText: Record<string, string> = {
  unit_differs: "different unit",
  lab_differs: "different lab",
  reference_range_differs: "different reference range",
  value_unreadable: "value unreadable",
  value_is_a_limit: "one value is a limit",
  value_needs_check: "a value still needs checking",
};

export function changeLabel(comparison: ResultComparison): string {
  switch (comparison.change) {
    case "first":
      return "First result";
    case "up":
      return "Higher";
    case "down":
      return "Lower";
    case "same":
      return "Unchanged";
    case "changed":
      return "Changed";
    default:
      return `Not compared: ${comparison.reasons.map((r) => notComparableText[r] ?? r).join(", ")}`;
  }
}
