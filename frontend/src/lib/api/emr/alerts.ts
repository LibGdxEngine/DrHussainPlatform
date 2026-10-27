"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import type { Page } from "./page";

type Schemas = components["schemas"];
export type PatientAlert = Schemas["PatientAlert"];
export type Activity = Schemas["Activity"];
export type ActivityPage = Schemas["PaginatedActivityList"];
export type ActivityMember = Schemas["ActivityMember"];
export type ActivityGroup = "signin" | "view" | "edit" | "send" | "alert" | "denied";

export interface ActivityQuery {
  group?: ActivityGroup;
  actor?: string;
  patient?: string;
  since?: string;
  until?: string;
  page?: number;
}

/** Alert rules that fired on a patient's results. The doctor acknowledges each with a reason. */
export const alertsApi = {
  list: (query: {
    patient?: string; report?: string; status?: "open" | "acknowledged" | "resolved" | "all"; page_size?: number;
  }) =>
    apiClient.get<Page<PatientAlert>>("/product/alerts/", { query }),
  acknowledge: (id: string, reason: string) =>
    apiClient.post<PatientAlert>(`/product/alerts/${id}/acknowledge/`, { reason }),
};

/** The clinic's audit log (doctor only). */
export const activityApi = {
  list: (query: ActivityQuery) => apiClient.get<ActivityPage>("/product/activity/", { query: { ...query } }),
  members: () => apiClient.get<ActivityMember[]>("/product/activity/members/"),
};
