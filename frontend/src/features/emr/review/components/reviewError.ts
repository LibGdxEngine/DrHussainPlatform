import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import type { ReviewErrorCode } from "@/lib/api/emr/review";

/** Refusals that also moved the case back to "Needs the doctor" (its draft kept), with what can be done now. */
const HOLD_CODES: ReviewErrorCode[] = ["values_need_check", "red_alert_open", "alert_rules_not_checked"];

const plain: Partial<Record<ReviewErrorCode, string>> = {
  values_need_check:
    "A value in this report has not been checked yet. The case is back in “Needs the doctor”: use “Check this value” on each marked value.",
  red_alert_open:
    "A red alert is open for this patient. The case is back in “Needs the doctor”: acknowledge the alert in the alerts panel, or choose “Draft anyway” after reading it.",
  alert_rules_not_checked:
    "The alert rules could not be checked on the patient's latest form. The case is back in “Needs the doctor”: run “Check alerts now” on the patient's visit, or choose “Draft anyway”.",
};

/** A review request's error in plain words: doctor-only refusals, field errors, known codes, then the server's message. */
export function reviewError(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 403) return "Only the doctor can do this.";
  if (err instanceof ApiError && Object.keys(err.fields).length) {
    return Object.values(err.fields).flat().join(" ");
  }
  if (err instanceof ApiError && plain[err.code as ReviewErrorCode]) return plain[err.code as ReviewErrorCode] as string;
  return apiErrorMessage(err, fallback);
}

/** The approval was held by an open red alert: the alerts panel should be loaded again to show it. */
export function isRedAlertHold(err: unknown): boolean {
  return err instanceof ApiError && err.code === "red_alert_open";
}

/** The refusal moved the case back to the doctor: reload it so its flag and the actions now available show. */
export function isCaseHold(err: unknown): boolean {
  return err instanceof ApiError && HOLD_CODES.includes(err.code as ReviewErrorCode);
}
