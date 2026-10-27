"use client";

import { useMemo } from "react";
import { appointmentsApi, type Appointment } from "@/lib/api/emr/appointments";
import type { Patient } from "@/lib/api/emr/patients";
import type { JourneyStep } from "./data";
import { buildJourney, nextVisit } from "./logic";
import { usePatientResource } from "./usePatientResource";

const loadVisits = (patient: string) => appointmentsApi.list({ patient });

/** The patient's visits, the pathway built from them, and today's or the next visit. */
export function usePatientJourney(patient: Patient): {
  steps?: JourneyStep[];
  next?: Appointment;
  error?: string;
} {
  const visits = usePatientResource(patient.id, loadVisits, "Could not load the visits.");
  const { data, loadedAt } = visits;
  return useMemo(() => {
    if (!data || loadedAt === undefined) return { error: visits.error };
    const now = new Date(loadedAt);
    return { steps: buildJourney(patient, data, now), next: nextVisit(data, now) };
  }, [data, loadedAt, patient, visits.error]);
}
