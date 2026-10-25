import { ApiError } from "../client";

export { ApiError };

/** The server's message for a failed EMR request, or `fallback` for network and unknown errors. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status !== 0 ? err.message : fallback;
}
