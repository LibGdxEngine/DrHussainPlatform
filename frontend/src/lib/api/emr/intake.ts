"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type IntakeForm = Schemas["IntakeForm"];
export type IntakeFormDetail = Schemas["IntakeFormDetail"];
export type IntakeFormLink = Schemas["IntakeFormLink"];
export type IntakeFormCreate = Schemas["IntakeFormCreateRequest"];
export type IntakeFormStatus = Schemas["IntakeFormStatusEnum"];
export type IntakeFormKind = Schemas["IntakeFormKindEnum"];
export type MrsPoint = Schemas["MrsPoint"];
export type LinkOpened = Schemas["LinkOpened"];
export type PatientForm = Schemas["PatientForm"];
export type IntakeAnswers = Schemas["AnswersRequest"];
export type FormSave = Schemas["FormSaveRequest"];

const BASE = "/product/intake";

/** Staff side: issue, send and read patient forms. */
export const intakeApi = {
  list: (query: { patient?: string; appointment?: string }) =>
    apiClient.get<Page<IntakeForm>>(`${BASE}/forms/`, { query: { ...query, page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
  get: (id: string) => apiClient.get<IntakeFormDetail>(`${BASE}/forms/${id}/`),
  /** Rejects with NO_RECIPIENT or MAILBOX_NOT_READY when send_email is set and it can't be emailed. */
  issue: (body: IntakeFormCreate) => apiClient.post<IntakeFormLink>(`${BASE}/forms/`, body),
  /** A fresh link to paste elsewhere (WhatsApp). The previous link stops working. */
  copyLink: (id: string) => apiClient.post<IntakeFormLink>(`${BASE}/forms/${id}/link/`),
  send: (id: string) => apiClient.post<IntakeFormLink>(`${BASE}/forms/${id}/send/`),
  mrs: (patient: string) => apiClient.get<MrsPoint[]>(`${BASE}/forms/mrs/`, { query: { patient } }),
};

/** Patient side: no staff session; the link token, then the date of birth. */
export const patientFormApi = {
  open: (token: string) => apiClient.post<LinkOpened>(`${BASE}/public/open/`, { token }, { auth: false }),
  /** Rejects with DATE_OF_BIRTH_MISMATCH, or LINK_LOCKED after too many tries. */
  verify: (token: string, date_of_birth: string) =>
    apiClient.post<{ session: string }>(`${BASE}/public/verify/`, { token, date_of_birth }, { auth: false }),
  get: (session: string) =>
    apiClient.get<PatientForm>(`${BASE}/public/form/`, { auth: false, headers: { "X-Intake-Session": session } }),
  save: (session: string, body: FormSave) =>
    apiClient.patch<PatientForm>(`${BASE}/public/form/`, body, { auth: false, headers: { "X-Intake-Session": session } }),
  submit: (session: string, body: FormSave) =>
    apiClient.post<PatientForm>(`${BASE}/public/form/`, body, { auth: false, headers: { "X-Intake-Session": session } }),
};
