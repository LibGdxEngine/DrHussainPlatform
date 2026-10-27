"use client";

import { intakeApi } from "@/lib/api/emr/intake";
import type { Patient } from "@/lib/api/emr/patients";
import { formatDay } from "../../format";
import { JourneyTracker } from "../../journey/components/JourneyTracker";
import { visitTitle } from "../../journey/logic";
import { usePatientJourney } from "../../journey/usePatientJourney";
import { usePatientResource } from "../../journey/usePatientResource";
import { emrRoutes } from "../../routes";
import { PatientHeader } from "../../shell/PatientHeader";
import { usePatientByFileNumber } from "../../shell/usePatientByFileNumber";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { formStatusText, lowerFirst } from "../../visit/answers";
import { loadFollowUpForm } from "../../visit/forms";
import { DoctorPanel } from "./DoctorPanel";
import { MrsSummary } from "./MrsSummary";
import { PatientAnswers } from "./PatientAnswers";
import { TrendPanel } from "./TrendPanel";

const loadMrs = (patient: string) => intakeApi.mrs(patient);

/** Trends & follow-up of one patient, chosen by `?patient=<file number>`. */
export function FollowupScreen({ fileNumber }: { fileNumber?: string }) {
  const { patient, message } = usePatientByFileNumber(fileNumber);

  if (!patient) {
    const loading = !!fileNumber && !message;
    return (
      <Panel className="flex flex-col items-start gap-3 p-6">
        <h1 className="m-0 text-xl font-semibold">{loading ? "Opening the file…" : "Trends & follow-up"}</h1>
        {!loading ? (
          <>
            <p role={message ? "alert" : undefined} className="m-0 text-sm text-muted">
              {message ?? "Choose a patient to see their trends and follow-up."}
            </p>
            <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
          </>
        ) : null}
      </Panel>
    );
  }
  return <Followup key={patient.id} patient={patient} />;
}

function Followup({ patient }: { patient: Patient }) {
  const journey = usePatientJourney(patient);
  const form = usePatientResource(patient.id, loadFollowUpForm, "Could not load the follow-up form.");
  const mrs = usePatientResource(patient.id, loadMrs, "Could not load the MRS scores.");

  const meta = [
    journey.next ? `Next: ${visitTitle[journey.next.kind]} · ${formatDay(journey.next.starts_at)}` : "",
    form.data ? `Follow-up form: ${lowerFirst(formStatusText(form.data.answered ?? form.data.latest))}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PatientHeader
        tab="trends"
        realPatient
        name={`${patient.full_name}, ${patient.age}`}
        mrn={patient.file_number}
        initial={patient.full_name.charAt(0).toUpperCase()}
        meta={meta || undefined}
      />
      <JourneyTracker steps={journey.steps} error={journey.error} compact />
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
        <div className="flex flex-col gap-4">
          <TrendPanel patientId={patient.id} mrs={mrs.data} mrsError={mrs.error} />
          <div className="grid grid-cols-2 gap-4">
            <MrsSummary points={mrs.data} error={mrs.error} />
            <PatientAnswers form={form.data} error={form.error} />
          </div>
        </div>
        <DoctorPanel patientId={patient.id} mrn={patient.file_number} />
      </div>
    </>
  );
}
