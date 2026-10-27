"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

type Schemas = components["schemas"];
export type Challenge = Schemas["VerificationChallengeResponse"];

/** Account sign-up for an invited colleague: create the account, then confirm the WhatsApp code. */
export const accountsApi = {
  signup: (body: Schemas["SignupRequest"]) =>
    apiClient.post<Challenge>("/accounts/signup/", body, { auth: false }),
  confirm: (body: Schemas["VerificationConfirmRequest"]) =>
    apiClient.post<Schemas["SignupVerification"]>("/accounts/verification/confirm/", body, { auth: false }),
  resend: (body: Schemas["VerificationResendRequest"]) =>
    apiClient.post<{ message: string; expires_in: number }>("/accounts/verification/resend/", body, { auth: false }),
};
