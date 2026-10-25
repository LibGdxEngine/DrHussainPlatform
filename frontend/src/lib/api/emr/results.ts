"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

type Schemas = components["schemas"];
export type LabTest = Schemas["LabTest"];
export type InvestigationReport = Schemas["InvestigationReport"];
export type ResultValue = Schemas["ResultValue"];
export type ResultComparison = Schemas["Comparison"];
export type ManualEntry = Schemas["ManualEntryRequest"];

export const resultsApi = {
  tests: (tracked = false) =>
    apiClient.get<LabTest[]>("/product/results/tests/", { query: tracked ? { tracked: true } : undefined }),
  /** Doctor only: add a test to the clinic's catalog. */
  createTest: (body: Schemas["LabTestRequest"]) => apiClient.post<LabTest>("/product/results/tests/", body),
  /** Doctor only: change targets, tracking or the labs' names for a test. */
  updateTest: (id: string, body: Schemas["PatchedLabTestRequest"]) =>
    apiClient.patch<LabTest>(`/product/results/tests/${id}/`, body),
  /** The report read from one document, if it has been read or typed in. */
  async forDocument(document: string): Promise<InvestigationReport | null> {
    const reports = await apiClient.get<InvestigationReport[]>("/product/results/reports/", { query: { document } });
    return reports[0] ?? null;
  },
  /** Queue a lab or pathology file that was never read (uploaded before reading existed). */
  read: (document: string) => apiClient.post<unknown>("/product/results/reports/read/", { document }),
  reread: (id: string) => apiClient.post<InvestigationReport>(`/product/results/reports/${id}/reread/`),
  /** Doctor only: the flagged report belongs to this patient. */
  confirm: (id: string) => apiClient.post<InvestigationReport>(`/product/results/reports/${id}/confirm/`),
  saveManualValues: (body: ManualEntry) => apiClient.post<InvestigationReport>("/product/results/manual-values/", body),
  history: (patient: string, test?: string) =>
    apiClient.get<ResultValue[]>("/product/results/history/", { query: { patient, test } }),
};
