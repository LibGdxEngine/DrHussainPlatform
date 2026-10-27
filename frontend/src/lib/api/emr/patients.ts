"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

type Schemas = components["schemas"];
export type Patient = Schemas["Patient"];
export type PatientCreate = Schemas["PatientCreateRequest"];
export type PatientUpdate = Schemas["PatchedPatientRequest"];
export type PatientPage = Schemas["PaginatedPatientList"];
export type SimilarPatient = Pick<Patient, "id" | "file_number" | "full_name" | "full_name_ar" | "date_of_birth">;

export interface PatientListQuery {
  /** Name in English or Arabic, file number, mobile or email. */
  q?: string;
  /** YYYY-MM-DD; lists patients born on or within a year of this day, nearest first. */
  date_of_birth?: string;
  file_number?: string;
  page?: number;
  page_size?: number;
}

export const patientsApi = {
  list: (query: PatientListQuery = {}) => apiClient.get<PatientPage>("/product/patients/", { query: { ...query } }),
  get: (id: string) => apiClient.get<Patient>(`/product/patients/${id}/`),
  /** Rejects with code DUPLICATE_PATIENT (context.similar) unless confirm_duplicate is set. */
  create: (body: PatientCreate) => apiClient.post<Patient>("/product/patients/", body),
  update: (id: string, body: PatientUpdate) => apiClient.patch<Patient>(`/product/patients/${id}/`, body),
  async byFileNumber(fileNumber: string): Promise<Patient | null> {
    const page = await patientsApi.list({ file_number: fileNumber, page_size: 1 });
    return page.results[0] ?? null;
  },
};
