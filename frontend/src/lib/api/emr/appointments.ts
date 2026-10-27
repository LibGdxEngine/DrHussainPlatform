"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";

type Schemas = components["schemas"];
export type Appointment = Schemas["Appointment"];
export type AppointmentBooked = Schemas["AppointmentBooked"];
export type AppointmentBooking = Schemas["AppointmentWriteRequest"];
export type AppointmentUpdate = Schemas["PatchedAppointmentUpdateRequest"];
export type AppointmentStatus = Schemas["AppointmentStatusEnum"];
export type VisitKind = Schemas["VisitKindEnum"];
export type VisitKindOption = Schemas["VisitKind"];
export type DayCount = Schemas["DayCount"];

export interface AppointmentQuery {
  /** One day, YYYY-MM-DD. */
  date?: string;
  from?: string;
  to?: string;
  patient?: string;
  include_cancelled?: boolean;
}

const BASE = "/product/appointments";

/** The clinic schedule. Visits are cancelled, never deleted. */
export const appointmentsApi = {
  list: (query: AppointmentQuery, signal?: AbortSignal) =>
    apiClient.get<Appointment[]>(`${BASE}/`, { query: { ...query }, signal }),
  get: (id: string) => apiClient.get<Appointment>(`${BASE}/${id}/`),
  /** With send_form, the patient form link is emailed; form_link comes back when it could not be. */
  book: (body: AppointmentBooking) => apiClient.post<AppointmentBooked>(`${BASE}/`, body),
  update: (id: string, body: AppointmentUpdate) => apiClient.patch<Appointment>(`${BASE}/${id}/`, body),
  checkIn: (id: string) => apiClient.post<Appointment>(`${BASE}/${id}/check-in/`),
  days: (from: string, to: string, signal?: AbortSignal) =>
    apiClient.get<DayCount[]>(`${BASE}/days/`, { query: { from, to }, signal }),
  kinds: () => apiClient.get<VisitKindOption[]>(`${BASE}/kinds/`),
};
