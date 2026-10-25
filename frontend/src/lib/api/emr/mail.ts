"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

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
    list: (folder: MailFolder, filter: MailFilter, q?: string, patient?: string) =>
      apiClient.get<MailThread[]>(`${BASE}/threads/`, {
        query: { folder, filter: filter === "all" ? undefined : filter, q: q || undefined, patient },
      }),
    counts: () => apiClient.get<InboxCounts>(`${BASE}/threads/counts/`),
    /** Opening a thread marks it read. */
    get: (id: string) => apiClient.get<MailThreadDetail>(`${BASE}/threads/${id}/`),
    state: (id: string, body: { unread?: boolean; archived?: boolean }) =>
      apiClient.patch<MailThreadDetail>(`${BASE}/threads/${id}/state/`, body),
    link: (id: string, patient: string | null) =>
      apiClient.post<MailThreadDetail>(`${BASE}/threads/${id}/link/`, { patient }),
    /** Doctor only: an everyday reply. Results emails go through the review queue. */
    reply: (id: string, body: string, documents: string[] = []) =>
      apiClient.post<MailThreadDetail>(`${BASE}/threads/${id}/reply/`, { body, documents }),
  },
  attachments: {
    file: (id: string) => apiClient.blob(`${BASE}/attachments/${id}/file/`, { timeoutMs: 120_000 }),
    /** File it in the patient's documents; lab reports are then read automatically. */
    save: (id: string, slot: DocumentSlot, title?: string) =>
      apiClient.post<Schemas["MailAttachment"]>(`${BASE}/attachments/${id}/save/`, { slot, title }),
  },
};
