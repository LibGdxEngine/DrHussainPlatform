"use client";

import { useEffect, useState } from "react";
import { emrRoutes } from "@/features/emr/routes";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";
import { ActionLink } from "@/features/emr/ui/Action";
import { Panel } from "@/features/emr/ui/Panel";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";
import { DocumentsWorkspace } from "./DocumentsWorkspace";

/** The lookup result for one file number, so a stale answer is never shown for another. */
type Lookup = { fileNumber: string; patient?: Patient; message?: string };

/** Documents tab of one patient's file, chosen by `?patient=<file number>`. */
export function DocsScreen({ fileNumber }: { fileNumber?: string }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!fileNumber) return;
    let cancelled = false;
    patientsApi
      .byFileNumber(fileNumber)
      .then((patient) => {
        if (cancelled) return;
        setLookup(patient
          ? { fileNumber, patient }
          : { fileNumber, message: `No patient has the file number ${fileNumber}.` });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLookup({ fileNumber, message: apiErrorMessage(err, "Could not load the patient.") });
      });
    return () => {
      cancelled = true;
    };
  }, [fileNumber]);

  const current = lookup?.fileNumber === fileNumber ? lookup : null;
  const state = !fileNumber
    ? { status: "missing" as const, message: "Choose a patient to see their documents." }
    : current?.patient
      ? { status: "ready" as const, patient: current.patient }
      : current
        ? { status: "missing" as const, message: current.message }
        : { status: "loading" as const };

  if (state.status !== "ready") {
    return (
      <Panel className="flex flex-col items-start gap-3 p-6">
        <h1 className="m-0 text-xl font-semibold">{state.status === "loading" ? "Opening the file…" : "Documents"}</h1>
        {state.status === "missing" ? (
          <>
            <p className="m-0 text-sm text-muted">{state.message}</p>
            <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
          </>
        ) : null}
      </Panel>
    );
  }

  const { patient } = state;
  return (
    <>
      <PatientHeader
        tab="docs"
        name={`${patient.full_name}, ${patient.age}`}
        mrn={patient.file_number}
        initial={patient.full_name.charAt(0).toUpperCase()}
        meta="Staff can scan, name files and enter key values. Medical notes are doctor-only."
      />
      <DocumentsWorkspace patient={patient} />
    </>
  );
}
