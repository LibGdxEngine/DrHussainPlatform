"use client";

import { emrRoutes } from "../../routes";
import { PatientHeader } from "../../shell/PatientHeader";
import { usePatientByFileNumber } from "../../shell/usePatientByFileNumber";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { ExamWorkspace } from "./ExamWorkspace";

export function ExamScreen({ fileNumber }: { fileNumber?: string }) {
  const { patient, message } = usePatientByFileNumber(fileNumber);
  if (!patient) return (
    <Panel className="flex flex-col items-start gap-3 p-6">
      <h1 className="m-0 text-xl font-semibold">Exam &amp; plan</h1>
      <p className="m-0 text-sm text-muted">
        {!fileNumber ? "Choose a patient to examine." : message ?? "Opening patient file…"}
      </p>
      <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
    </Panel>
  );
  return (
    <>
      <PatientHeader tab="exam" realPatient name={`${patient.full_name}, ${patient.age}`}
        mrn={patient.file_number} initial={patient.full_name.charAt(0).toUpperCase()}
        meta="Vitals, examination, screening and plan. Every save keeps a version." />
      <ExamWorkspace key={patient.id} patient={patient} />
    </>
  );
}
