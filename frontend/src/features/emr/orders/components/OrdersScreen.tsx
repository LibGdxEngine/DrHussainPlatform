"use client";

import { emrRoutes } from "@/features/emr/routes";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";
import { useMe } from "@/features/emr/shell/useMe";
import { usePatientByFileNumber } from "@/features/emr/shell/usePatientByFileNumber";
import { ActionLink } from "@/features/emr/ui/Action";
import { Panel } from "@/features/emr/ui/Panel";
import { OrdersWorkspace } from "./OrdersWorkspace";

/** Orders & prescriptions tab of one patient's file, chosen by `?patient=<file number>`. */
export function OrdersScreen({ fileNumber }: { fileNumber?: string }) {
  const { patient, message } = usePatientByFileNumber(fileNumber);
  const me = useMe();

  if (!patient) {
    const missing = !fileNumber || message;
    return (
      <Panel className="flex flex-col items-start gap-3 p-6">
        <h1 className="m-0 text-xl font-semibold">{missing ? "Orders & prescriptions" : "Opening the file…"}</h1>
        {missing ? (
          <>
            <p role={message ? "alert" : undefined} className="m-0 text-sm text-muted">
              {message ?? "Choose a patient to see their orders and prescriptions."}
            </p>
            <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
          </>
        ) : null}
      </Panel>
    );
  }

  return (
    <>
      <PatientHeader
        tab="orders"
        realPatient
        name={`${patient.full_name}, ${patient.age}`}
        mrn={patient.file_number}
        initial={patient.full_name.charAt(0).toUpperCase()}
        meta={me?.is_lead === false ? "Read-only: only the doctor issues orders." : "Lab requests and prescriptions are issued by the doctor."}
      />
      <OrdersWorkspace patient={patient} isLead={me ? me.is_lead : null} clinicName={me?.clinic_name ?? ""} />
    </>
  );
}
