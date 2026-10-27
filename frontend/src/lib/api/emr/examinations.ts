"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type Examination = Schemas["Examination"];
export type ExaminationPlan = Schemas["PlanEnum"];
/** The fields the doctor records; everything except the patient and bookkeeping. */
export type ExaminationFields = Omit<Schemas["ExaminationRequest"], "patient" | "expected_version">;

const BASE = "/product/records/examinations/";

/** A patient's examinations (vitals, findings, screening and plan). Doctor only; every save keeps a version. */
export const examinationsApi = {
  /** Newest first. */
  list: async (patient: string) => {
    const page = await apiClient.get<Page<Examination>>(BASE, { query: { patient, page_size: MAX_PAGE_SIZE } });
    return page.results;
  },
  create: (patient: string, fields: ExaminationFields) => apiClient.post<Examination>(BASE, { patient, ...fields }),
  /** Rejects with EXAMINATION_CONFLICT when someone saved this examination since it was loaded. */
  update: (id: string, expected_version: number, fields: ExaminationFields) =>
    apiClient.patch<Examination>(`${BASE}${id}/`, { expected_version, ...fields }),
};
