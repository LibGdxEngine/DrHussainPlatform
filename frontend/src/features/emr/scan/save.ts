"use client";

import { apiErrorMessage } from "@/lib/api/emr/errors";
import { documentsApi, type DocumentSource } from "@/lib/api/emr/documents";
import type { ScanFile } from "./data";

/** Uploads one file to the patient's record; the row comes back saved or with the server's reason. */
export async function saveScan<T extends ScanFile>(row: T, patient: string, source: DocumentSource): Promise<T> {
  if (!row.slot) return { ...row, status: "error", message: "Choose a category." };
  try {
    const document = await documentsApi.upload({
      patient,
      slot: row.slot,
      file: row.file,
      title: row.title.trim() || undefined,
      document_date: row.date || undefined,
      source,
    });
    return { ...row, status: "saved", message: undefined, document: document.id, title: document.title };
  } catch (err) {
    return { ...row, status: "error", message: apiErrorMessage(err, "Upload failed. Try again.") };
  }
}
