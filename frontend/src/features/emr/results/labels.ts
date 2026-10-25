import type { InvestigationReport, ResultComparison } from "@/lib/api/emr/results";

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
};

/** Why a report needs the doctor, in the words staff see. Unknown codes fall back to the code. */
const flagText: Record<string, string> = {
  unreadable_document: "The file could not be opened as a report.",
  no_text_found: "No text could be read from the file.",
  ocr_unavailable: "Scanned reports cannot be read on this server yet.",
  too_many_pages: "The file has too many pages to read automatically.",
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
};

export function flagReason(code: string): string {
  return flagText[code] ?? code.replaceAll("_", " ");
}

const notComparableText: Record<string, string> = {
  unit_differs: "different unit",
  lab_differs: "different lab",
  reference_range_differs: "different reference range",
  value_unreadable: "value unreadable",
  value_is_a_limit: "one value is a limit",
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
