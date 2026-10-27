import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";

/** Settings changes are doctor-only; say so plainly instead of showing a bare 403. */
export function settingsError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) return "Only the doctor can change clinic settings.";
  if (err instanceof ApiError && Object.keys(err.fields).length) {
    return Object.values(err.fields).flat().join(" ");
  }
  return apiErrorMessage(err, fallback);
}
