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
/**
 * The automatic answer check a rule runs on her form answers (AlertRule.answer_check; "" for none).
 * `medicine_terms` lists the medicine names that make a rule fire (matched without case or punctuation).
 */
export type AnswerCheck = Schemas["AnswerCheckEnum"];
/** System phrases are templates of kind "phrase", keyed `phrase.<name>`, versioned and approved per language. */
export const PHRASE_PREFIX = "phrase.";
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
    list: (filters: { pinned?: boolean; kind?: TemplateKind; language?: string } = {}) =>
      whole<EmailTemplate>(`${BASE}/templates/`, {
        pinned: filters.pinned || undefined, kind: filters.kind, language: filters.language,
      }),
    /** The system phrases (short wording used inside drafts), optionally in one language. */
    phrases: (language?: string) => whole<EmailTemplate>(`${BASE}/templates/`, { kind: "phrase", language }),
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
    /** Doctor only: change one rule (e.g. its medicine_terms); saved as the rule's next version. */
    update: (id: string, body: Schemas["PatchedAlertRuleRequest"]) =>
      apiClient.patch<AlertRule>(`${BASE}/alert-rules/${id}/`, body),
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
