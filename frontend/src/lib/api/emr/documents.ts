"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

type Schemas = components["schemas"];
export type PatientDocument = Schemas["Document"];
export type DocumentSlot = Schemas["SlotEnum"];
export type DocumentSource = Schemas["DocumentSourceEnum"];
export type DocumentUpdate = Schemas["PatchedDocumentRequest"];

export interface DocumentUpload {
  patient: string;
  slot: DocumentSlot;
  file: File;
  title?: string;
  document_date?: string;
  source?: DocumentSource;
}

/** Large scans need longer than the default request timeout. */
const FILE_TIMEOUT_MS = 120_000;

export const documentsApi = {
  list: (patient: string, slot?: DocumentSlot) =>
    apiClient.get<PatientDocument[]>("/product/records/documents/", { query: { patient, slot } }),
  /** Rejects with DUPLICATE_DOCUMENT, DOCUMENT_TOO_LARGE or UNSUPPORTED_DOCUMENT_TYPE. */
  upload(body: DocumentUpload) {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== "") form.append(key, value);
    }
    return apiClient.upload<PatientDocument>("/product/records/documents/", form, { timeoutMs: FILE_TIMEOUT_MS });
  },
  update: (id: string, body: DocumentUpdate) =>
    apiClient.patch<PatientDocument>(`/product/records/documents/${id}/`, body),
  /** The original file; staff never get a direct URL to it. */
  file: (id: string, download = false) =>
    apiClient.blob(`/product/records/documents/${id}/file/`, {
      query: download ? { download: true } : undefined,
      timeoutMs: FILE_TIMEOUT_MS,
    }),
};
