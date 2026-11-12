"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import type { Page } from "./page";

type Schemas = components["schemas"];
export type Mailbox = Schemas["Mailbox"];
export type MailboxUpdate = Schemas["PatchedMailboxRequest"];
export type MailSecurity = Schemas["MailSecurityEnum"];
export type ConnectionCheck = Schemas["ConnectionCheck"];
export type MailThread = Schemas["MailThread"];
export type MailThreadDetail = Schemas["MailThreadDetail"];
export type MailMessage = Schemas["MailMessage"];
export type InboxCounts = Schemas["InboxCounts"];
export type MailFolder = "inbox" | "sent" | "archive";
export type MailFilter = "all" | "unread" | "patients" | "unmatched";
export type DocumentSlot = Schemas["SlotEnum"];
/** Whose file the suggested patient is: the sender's own, or someone else's (a relative writing in). */
export type SuggestionKind = "sender" | "third_party" | "";
/** Error code (409) when a link or reply involves a sender who is not the patient and needs confirming. */
export const THIRD_PARTY_CONFIRM = "THIRD_PARTY_CONFIRM";

export interface LinkOptions {
  /** Required when the sender is not the patient; with `relation` (who they are to the patient). */
  confirmThirdParty?: boolean;
  relation?: string;
}

const BASE = "/product/mail";

/** The clinic's own mailbox: settings, threads, replies and attachments. */
export const mailApi = {
  mailbox: {
    get: () => apiClient.get<Mailbox>(`${BASE}/mailbox/`),
    /** Doctor only. Leave a password blank to keep the saved one. */
    update: (body: MailboxUpdate) => apiClient.patch<Mailbox>(`${BASE}/mailbox/`, body),
    check: () => apiClient.post<ConnectionCheck>(`${BASE}/mailbox/check/`, undefined, { timeoutMs: 60_000 }),
    sync: () => apiClient.post<void>(`${BASE}/mailbox/sync/`),
  },
  threads: {
    /** The newest page of threads in a folder; `count` is the folder's total. */
    list: (folder: MailFolder, filter: MailFilter, q?: string, patient?: string, page = 1) =>
      apiClient.get<Page<MailThread>>(`${BASE}/threads/`, {
        query: { folder, filter: filter === "all" ? undefined : filter, q: q || undefined, patient, page },
      }),
    /** One patient's threads across every folder (inbox, sent and archived), newest first. */
    forPatient: (patient: string, page = 1) =>
      apiClient.get<Page<MailThread>>(`${BASE}/threads/`, { query: { patient, page } }),
    counts: () => apiClient.get<InboxCounts>(`${BASE}/threads/counts/`),
    /** Opening a thread marks it read. */
    get: (id: string) => apiClient.get<MailThreadDetail>(`${BASE}/threads/${id}/`),
    state: (id: string, body: { unread?: boolean; archived?: boolean }) =>
      apiClient.patch<MailThreadDetail>(`${BASE}/threads/${id}/state/`, body),
    /** Rejects with THIRD_PARTY_CONFIRM (409, context.patient_email/contact_email) unless confirmed. */
    link: (id: string, patient: string | null, options: LinkOptions = {}) =>
      apiClient.post<MailThreadDetail>(`${BASE}/threads/${id}/link/`, {
        patient, confirm_third_party: options.confirmThirdParty ?? false, relation: options.relation,
      }),
    /**
     * Doctor only: an everyday reply. Results emails go through the review queue. On a third-party
     * thread it rejects with THIRD_PARTY_CONFIRM (409) unless `confirmThirdParty`.
     */
    reply: (id: string, body: string, documents: string[] = [], confirmThirdParty = false) =>
      apiClient.post<MailThreadDetail>(`${BASE}/threads/${id}/reply/`, {
        body, documents, confirm_third_party: confirmThirdParty,
      }),
  },
  attachments: {
    file: (id: string) => apiClient.blob(`${BASE}/attachments/${id}/file/`, { timeoutMs: 120_000 }),
    /** File it in the patient's documents; lab reports are then read automatically. */
    save: (id: string, slot: DocumentSlot, title?: string) =>
      apiClient.post<Schemas["MailAttachment"]>(`${BASE}/attachments/${id}/save/`, { slot, title }),
  },
};
