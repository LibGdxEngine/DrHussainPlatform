"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type EmailTemplate = Schemas["EmailTemplate"];
export type EmailTemplateVersion = Schemas["EmailTemplateVersion"];
export type TemplateKind = Schemas["TemplateKindEnum"];
export type TemplatePreview = Schemas["TemplatePreview"];
export type Placeholder = Schemas["Placeholder"];
export type Prescription = Schemas["Prescription"];
export type PrescriptionVersion = Schemas["PrescriptionVersion"];
export type AlertRule = Schemas["AlertRule"];
export type AlertRuleChange = Schemas["AlertRuleChangeRequest"];
export type ScoreBandSet = Schemas["ScoreBandSet"];
export type ScoreBand = Schemas["ScoreBand"];
export type Leaflet = Schemas["Leaflet"];
export type ClinicProfile = Schemas["ClinicProfile"];

const BASE = "/product/content";
const FILE_TIMEOUT_MS = 120_000;

/** Every item of a short, bounded list (one clinic's templates, rules or leaflets). */
function whole<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
  return apiClient.get<Page<T>>(path, { query: { ...query, page_size: MAX_PAGE_SIZE } }).then((page) => page.results);
}

function form(fields: Record<string, string | File | undefined>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.append(key, value);
  return body;
}

/** Clinic-editable content. Reads are open to staff; every change is doctor-only and versioned. */
export const contentApi = {
  templates: {
    list: (filters: { pinned?: boolean } = {}) =>
      whole<EmailTemplate>(`${BASE}/templates/`, filters.pinned ? { pinned: true } : {}),
    create: (body: Schemas["EmailTemplateCreateRequest"]) => apiClient.post<EmailTemplate>(`${BASE}/templates/`, body),
    update: (id: string, body: Schemas["PatchedEmailTemplateRequest"]) =>
      apiClient.patch<EmailTemplate>(`${BASE}/templates/${id}/`, body),
    history: (id: string) => apiClient.get<EmailTemplateVersion[]>(`${BASE}/templates/${id}/versions/`),
    /** Save wording as the next version; `approve` also makes drafts use it. */
    saveVersion: (id: string, body: Schemas["TemplateWordingRequest"]) =>
      apiClient.post<EmailTemplate>(`${BASE}/templates/${id}/versions/`, body),
    approve: (id: string, number: number) =>
      apiClient.post<EmailTemplate>(`${BASE}/templates/${id}/approve/`, { number }),
    preview: (subject: string, body: string) =>
      apiClient.post<TemplatePreview>(`${BASE}/templates/preview/`, { subject, body }),
  },
  placeholders: () => apiClient.get<Placeholder[]>(`${BASE}/placeholders/`),
  prescriptions: {
    list: (archived = false) => whole<Prescription>(`${BASE}/prescriptions/`, archived ? { archived: true } : {}),
    create: (body: Schemas["PrescriptionRequest"]) => apiClient.post<Prescription>(`${BASE}/prescriptions/`, body),
    update: (id: string, body: Schemas["PatchedPrescriptionRequest"]) =>
      apiClient.patch<Prescription>(`${BASE}/prescriptions/${id}/`, body),
    history: (id: string) => apiClient.get<PrescriptionVersion[]>(`${BASE}/prescriptions/${id}/versions/`),
  },
  alertRules: {
    list: () => whole<AlertRule>(`${BASE}/alert-rules/`),
    /** All or none of the changes are saved. */
    saveChanges: (rules: AlertRuleChange[], note = "") =>
      apiClient.post<AlertRule[]>(`${BASE}/alert-rules/bulk/`, { rules, note }),
  },
  scoreBands: {
    get: (code: string) => apiClient.get<ScoreBandSet>(`${BASE}/score-bands/${code}/`),
    save: (code: string, bands: ScoreBand[], note = "") =>
      apiClient.post<ScoreBandSet>(`${BASE}/score-bands/${code}/bands/`, { bands, note }),
  },
  leaflets: {
    list: (archived = false) => whole<Leaflet>(`${BASE}/leaflets/`, archived ? { archived: true } : {}),
    upload: (title: string, file: File) =>
      apiClient.upload<Leaflet>(`${BASE}/leaflets/`, form({ title, file }), { timeoutMs: FILE_TIMEOUT_MS }),
    replace: (id: string, file: File, note = "") =>
      apiClient.upload<Leaflet>(`${BASE}/leaflets/${id}/replace/`, form({ file, note }), { timeoutMs: FILE_TIMEOUT_MS }),
    update: (id: string, body: Schemas["PatchedLeafletRequest"]) =>
      apiClient.patch<Leaflet>(`${BASE}/leaflets/${id}/`, body),
    file: (id: string) => apiClient.blob(`${BASE}/leaflets/${id}/file/`, { timeoutMs: FILE_TIMEOUT_MS }),
  },
  profile: {
    get: () => apiClient.get<ClinicProfile>(`${BASE}/profile/`),
    update: (body: Schemas["PatchedClinicProfileRequest"]) => apiClient.patch<ClinicProfile>(`${BASE}/profile/`, body),
  },
};
