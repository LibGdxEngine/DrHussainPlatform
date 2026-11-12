"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type IntakeForm = Schemas["IntakeForm"];
export type IntakeFormLink = Schemas["IntakeFormLink"];
export type IntakeFormCreate = Schemas["IntakeFormCreateRequest"];
export type IntakeFormStatus = Schemas["IntakeFormStatusEnum"];
export type IntakeFormKind = Schemas["IntakeFormKindEnum"];
/** A section staff can add on top of the ones her answers open. */
export type ExtraModule = Schemas["ExtraModulesEnum"];
export type MrsPoint = Schemas["MrsPoint"];
export type LinkOpened = Schemas["LinkOpened"];

/** One repeat-row answer (a medicine, a relative): field id -> value. */
export type AnswerRow = Record<string, string | number | boolean | null>;
/** One answer, shaped by its catalogue question type (single, multi, number, scale, text, date, tick, rows). */
export type AnswerValue = string | number | boolean | null | string[] | number[] | AnswerRow[];
/** Question id -> answer, as the catalogue describes; the backend drops answers to questions not shown. */
export type IntakeAnswers = { [questionId: string]: AnswerValue | undefined };

type ConditionValue = string | number | boolean;
/**
 * When a section opens, a question shows or is required (backend intake/catalogue.py `holds`).
 * `in`: for a list answer, any element is in the values; `not_in` is its negation (true when
 * unanswered); `age_gte` is the age in whole years; `module` an open section.
 */
export type CatalogueCondition =
  | { always: boolean }
  | { answer: string; in: ConditionValue[] }
  | { answer: string; not_in: ConditionValue[] }
  | { answered: string }
  | { age_gte: number }
  | { module: string }
  | { all: CatalogueCondition[] }
  | { any: CatalogueCondition[] }
  | { not: CatalogueCondition };

export type CatalogueOption = Schemas["CatalogueOption"];
export type CatalogueField = Schemas["CatalogueField"];
export type CatalogueQuestionType = Schemas["CatalogueQuestionTypeEnum"];
export type CatalogueQuestion = Omit<Schemas["CatalogueQuestion"], "show_if" | "required" | "flag"> & {
  show_if?: CatalogueCondition;
  /** true, or required only when the condition holds. */
  required: boolean | CatalogueCondition;
  /** Answer values highlighted for the doctor, or "any". */
  flag?: (string | number)[] | "any";
};
export type CatalogueSection = Omit<Schemas["CatalogueSection"], "opens_when" | "questions"> & {
  opens_when: CatalogueCondition | null;
  questions: CatalogueQuestion[];
};
export type Catalogue = { version: string; sections: CatalogueSection[] };

/** The patient's form: the catalogue, her saved answers, and what the clinic already knows. */
export type PatientForm = Omit<Schemas["PatientForm"], "answers" | "previous_answers" | "catalogue"> & {
  answers: IntakeAnswers;
  /** Carry-forward answers from her earlier complete forms, to confirm or edit. */
  previous_answers: IntakeAnswers;
  catalogue: Catalogue;
};
export type FormSave = Omit<Schemas["FormSaveRequest"], "answers"> & { answers?: IntakeAnswers };

/** One alert rule that could not be checked on the last run; `rule` is a rule code, or "all". */
export interface RuleError {
  rule: string;
  error: string;
}
export type SummaryModule = Schemas["SummaryModule"];
export type SummaryRow = Schemas["SummaryRow"];
/**
 * The doctor's view of a form. `history_summary` groups the answers by section; the rules count as
 * checked only when `rules_evaluated_at` is set and `rule_errors` is empty.
 */
export type IntakeFormDetail = Omit<Schemas["IntakeFormDetail"], "answers" | "rule_errors"> & {
  answers: IntakeAnswers;
  rule_errors: RuleError[];
};

const BASE = "/product/intake";

/** Staff side: issue, send and read patient forms. */
export const intakeApi = {
  list: (query: { patient?: string; appointment?: string }) =>
    apiClient.get<Page<IntakeForm>>(`${BASE}/forms/`, { query: { ...query, page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
  get: (id: string) => apiClient.get<IntakeFormDetail>(`${BASE}/forms/${id}/`),
  /**
   * Rejects with NO_RECIPIENT or MAILBOX_NOT_READY when send_email is set and it can't be emailed.
   * `extra_modules` adds sections on top of the ones her answers open.
   */
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
  /** Rejects with ANSWERS_INCOMPLETE (error.fields: the blank required question ids). */
  submit: (session: string, body: FormSave) =>
    apiClient.post<PatientForm>(`${BASE}/public/form/`, body, { auth: false, headers: { "X-Intake-Session": session } }),
};
