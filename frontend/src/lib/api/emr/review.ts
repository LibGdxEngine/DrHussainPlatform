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
/** A prescription chosen for one infection section of an STI email (Draft.section_prescriptions). */
export type DraftSectionPrescription = Schemas["DraftSectionPrescription"];
/** An abnormal-smear plan; `has_approved_wording` is false when its section has no approved text yet. */
export type SmearPlan = Schemas["SmearPlan"];
/** A part of an Arabic draft still in English (listed in Draft.missing_translations), with its English. */
export type TranslationSource = Schemas["TranslationSource"];
export type TranslationSave = Schemas["TranslationSaveRequest"];
/** Why a case waits for the doctor (ResultsCase.flag_reasons), beyond `red_alert_<rule code>`. */
export type CaseFlag =
  | "red_alert_open" | "alert_rules_not_checked" | "uncertain_value" | "unreadable_value" | "unknown_report_type"
  | "phrase_not_approved" | "template_not_approved" | "peanut_allergy_prometrium" | `red_alert_${string}`
  | (string & {});
/**
 * Business error codes the review endpoints reject with (error.code). `values_need_check` (409): a value is
 * still uncertain or unreadable-and-unchecked, which "draft anyway" never skips. `red_alert_open` (409, on
 * approve): an open red alert holds the send; `error.context.alerts` lists their ids. `alert_rules_not_checked`
 * (409, on approve): the rules could not be checked on the patient's latest form.
 */
export type ReviewErrorCode =
  | "already_sent" | "alert_rules_not_checked" | "cannot_draft" | "invalid_plan" | "invalid_section"
  | "invalid_wording" | "mailbox_not_set_up" | "missing_translations" | "no_patient_email" | "not_a_smear"
  | "not_editable" | "not_flagged" | "not_missing" | "not_ready" | "open_slots" | "phrase_not_approved"
  | "placeholders_differ" | "red_alert_open" | "subject_required" | "template_not_approved"
  | "use_section_prescriptions" | "values_need_check";

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
  /**
   * Approve and send. A reply to a third party's thread goes to the patient unless
   * `sendToThreadContact` (the doctor confirms the sender). Rejects with missing_translations, open_slots,
   * values_need_check, red_alert_open or alert_rules_not_checked.
   */
  approve: (id: string, sendToThreadContact = false) =>
    apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/approve/`, { send_to_thread_contact: sendToThreadContact }),
  /** Arabic draft: the parts still in English, each with its English and any suggested translation. */
  translations: (id: string) => apiClient.get<TranslationSource[]>(`${BASE}/${id}/translations/`),
  /**
   * Save the doctor's translation of one part for this case; the draft is rebuilt with it.
   * `keep_for_future` also approves it, so later drafts in that language reuse it. Rejects with
   * not_missing, placeholders_differ, subject_required or invalid_wording.
   */
  saveTranslation: (id: string, body: TranslationSave) =>
    apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/translations/`, body),
  reject: (id: string, reason: string) => apiClient.post<ResultsCaseDetail>(`${BASE}/${id}/reject/`, { reason }),
};
