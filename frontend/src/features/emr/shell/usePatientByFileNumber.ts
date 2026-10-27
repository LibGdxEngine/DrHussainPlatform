"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";

type Lookup = { fileNumber: string; patient?: Patient; message?: string };

/**
 * The patient a `?patient=VC-…` link points at. `patient` is set once loaded; `message` says why
 * it could not be; both are empty while loading or when no file number was given.
 */
export function usePatientByFileNumber(fileNumber?: string): { patient?: Patient; message?: string } {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  useEffect(() => {
    if (!fileNumber) return;
    let cancelled = false;
    patientsApi.byFileNumber(fileNumber).then((patient) => {
      if (!cancelled) setLookup(patient ? { fileNumber, patient } : { fileNumber, message: "Patient not found." });
    }).catch((error: unknown) => {
      if (!cancelled) setLookup({ fileNumber, message: apiErrorMessage(error, "Could not load the patient.") });
    });
    return () => { cancelled = true; };
  }, [fileNumber]);

  const current = lookup?.fileNumber === fileNumber ? lookup : null;
  return { patient: current?.patient, message: current?.message };
}
