"use client";

import { emrRoutes } from "@/features/emr/routes";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";
import { usePatientByFileNumber } from "@/features/emr/shell/usePatientByFileNumber";
import { ActionLink } from "@/features/emr/ui/Action";
import { Panel } from "@/features/emr/ui/Panel";
import { DiagnosesWorkspace } from "./DiagnosesWorkspace";

export function DiagnosesScreen({ fileNumber }: { fileNumber?: string }) {
  const { patient, message } = usePatientByFileNumber(fileNumber);
  if (!patient) return (
    <Panel className="flex flex-col items-start gap-3 p-6">
      <h1 className="m-0 text-xl font-semibold">Diagnoses</h1>
      <p className="m-0 text-sm text-muted">
        {!fileNumber ? "Choose a patient to view diagnoses." : message ?? "Opening patient file…"}
      </p>
      <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
    </Panel>
  );
  return (
    <>
      <PatientHeader tab="diagnoses" realPatient name={`${patient.full_name}, ${patient.age}`}
        mrn={patient.file_number} initial={patient.full_name.charAt(0).toUpperCase()}
        meta="Patient diagnoses and their recorded history" />
      <DiagnosesWorkspace key={patient.id} patient={patient} />
    </>
  );
}
