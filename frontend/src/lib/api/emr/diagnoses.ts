"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type DiagnosisStatus = Schemas["DiagnosisStatusEnum"];
export type DiagnosisRevision = Schemas["DiagnosisRevision"];
export type Diagnosis = Schemas["Diagnosis"];
export type DiagnosisFields = Required<Pick<Schemas["DiagnosisRequest"], "name" | "status" | "noted_on" | "notes">>;

export const diagnosesApi = {
  /** The newest page of a patient's diagnoses, unwrapped from the list envelope. */
  list: async (patient: string) => {
    const page = await apiClient.get<Page<Diagnosis>>("/product/records/diagnoses/", {
      query: { patient, page_size: MAX_PAGE_SIZE },
    });
    return page.results;
  },
  create: (patient: string, fields: DiagnosisFields) =>
    apiClient.post<Diagnosis>("/product/records/diagnoses/", { patient, ...fields }),
  update: (id: string, expected_version: number, fields: DiagnosisFields) =>
    apiClient.patch<Diagnosis>(`/product/records/diagnoses/${id}/`, { expected_version, ...fields }),
};
