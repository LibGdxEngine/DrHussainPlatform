"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import type { Page } from "./page";

type Schemas = components["schemas"];
export type ResultsCase = Schemas["ResultsCase"];
export type ResultsCaseDetail = Schemas["ResultsCaseDetail"];
export type CaseStatus = Schemas["ResultsCaseStatusEnum"];
export type Draft = Schemas["Draft"];
export type QueueCounts = Schemas["QueueCounts"];
export type QueueGroup = keyof QueueCounts;
export type DraftOptions = Schemas["DraftOptionsRequest"];
export type DraftEdit = Schemas["PatchedDraftEditRequest"];

const BASE = "/product/review/cases";

/** The results review queue. Every change is the doctor's; approving is the only way an email is sent. */
export const reviewApi = {
  /** The newest page of cases in a queue; `count` is the queue's total. */
  list: (group?: QueueGroup, patient?: string, page = 1) =>
    apiClient.get<Page<ResultsCase>>(`${BASE}/`, { query: { group, patient, page } }),
  counts: () => apiClient.get<QueueCounts>(`${BASE}/counts/`),
  get: (id: string) => apiClient.get<ResultsCaseDetail>(`${BASE}/${id}/`),
  /** Abnormal smear: the cervical smear section the doctor chose as the plan. */
  choosePlan: (id: string, template: string) =>
    apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/plan/`, { template }),
  /** Rebuild the draft with these choices. Rebuilding replaces typed edits. */
  options: (id: string, body: DraftOptions) => apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/options/`, body),
  edit: (id: string, body: DraftEdit) => apiClient.patch<ResultsCaseDetail>(`${BASE}/${id}/draft/`, body),
  draftAnyway: (id: string, reason: string) =>
    apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/draft-anyway/`, { reason }),
  approve: (id: string) => apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/approve/`),
  reject: (id: string, reason: string) => apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/reject/`, { reason }),
};
