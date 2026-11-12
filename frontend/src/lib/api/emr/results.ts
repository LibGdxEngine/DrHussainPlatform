"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type LabTest = Schemas["LabTest"];
export type InvestigationReport = Schemas["InvestigationReport"];
export type ResultValue = Schemas["ResultValue"];
export type ResultComparison = Schemas["Comparison"];
export type ManualEntry = Schemas["ManualEntryRequest"];
/** Why a value needs the doctor's check before it is used (ResultValue.check_reason). */
export type CheckReason =
  | "value_glued" | "ambiguous_comma" | "ref_leftover" | "unit_missing" | "name_unknown" | "split_line"
  | "ocr_low_confidence";
/** Corrections for an uncertain value; fields left out are confirmed as read. */
export type ValueCheck = Schemas["ValueCheckRequest"];
/** A remark on a comparison that still stands; `labs` is [this lab, earlier lab] when they differ. */
export type ComparisonNote = "lab_differs";

export const resultsApi = {
  /** The whole catalog (it is small and bounded). */
  tests: (tracked = false) =>
    apiClient
      .get<Page<LabTest>>("/product/results/tests/", { query: { tracked: tracked || undefined, page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
  /** Doctor only: add a test to the clinic's catalog. */
  createTest: (body: Schemas["LabTestRequest"]) => apiClient.post<LabTest>("/product/results/tests/", body),
  /** Doctor only: change targets, tracking or the labs' names for a test. */
  updateTest: (id: string, body: Schemas["PatchedLabTestRequest"]) =>
    apiClient.patch<LabTest>(`/product/results/tests/${id}/`, body),
  /** The report read from one document, if it has been read or typed in. */
  async forDocument(document: string): Promise<InvestigationReport | null> {
    const page = await apiClient.get<Page<InvestigationReport>>("/product/results/reports/", { query: { document } });
    return page.results[0] ?? null;
  },
  /** Queue a lab or pathology file that was never read (uploaded before reading existed). */
  read: (document: string) => apiClient.post<unknown>("/product/results/reports/read/", { document }),
  reread: (id: string) => apiClient.post<InvestigationReport>(`/product/results/reports/${id}/reread/`),
  /** Doctor only: the flagged report belongs to this patient. */
  confirm: (id: string) => apiClient.post<InvestigationReport>(`/product/results/reports/${id}/confirm/`),
  saveManualValues: (body: ManualEntry) => apiClient.post<InvestigationReport>("/product/results/manual-values/", body),
  /**
   * Doctor only: confirm or correct a value marked needs_check. Returns the report; once no value
   * needs a check its uncertain_value flag clears and the results case is routed again.
   */
  checkValue: (id: string, body: ValueCheck = {}) =>
    apiClient.post<InvestigationReport>(`/product/results/values/${id}/check/`, body),
  history: (patient: string, test?: string, page = 1) =>
    apiClient.get<Page<ResultValue>>("/product/results/history/", { query: { patient, test, page } }),
};
