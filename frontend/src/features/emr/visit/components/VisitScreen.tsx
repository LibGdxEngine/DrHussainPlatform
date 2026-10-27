"use client";

import type { Patient } from "@/lib/api/emr/patients";
import { formatDay } from "../../format";
import { JourneyTracker } from "../../journey/components/JourneyTracker";
import { RequestedFilesPanel } from "../../journey/components/RequestedFilesPanel";
import { visitTitle } from "../../journey/logic";
import { usePatientJourney } from "../../journey/usePatientJourney";
import { usePatientResource } from "../../journey/usePatientResource";
import { emrRoutes } from "../../routes";
import { PatientHeader } from "../../shell/PatientHeader";
import { useMe } from "../../shell/useMe";
import { usePatientByFileNumber } from "../../shell/usePatientByFileNumber";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { formStatusText, lowerFirst, readAnswers } from "../answers";
import { loadHistoryForm } from "../forms";
import { AlertsPanel } from "./AlertsPanel";
import { ModuleTabs } from "./ModuleTabs";
import { PatientFormPanel } from "./PatientFormPanel";
import { DocumentsPanel, EmailsPanel, KeyValuesPanel, SentOrdersPanel } from "./SidePanels";

/** Visit summary of one patient, chosen by `?patient=<file number>`. */
export function VisitScreen({ fileNumber }: { fileNumber?: string }) {
  const { patient, message } = usePatientByFileNumber(fileNumber);

  if (!patient) {
    const loading = !!fileNumber && !message;
    return (
      <Panel className="flex flex-col items-start gap-3 p-6">
        <h1 className="m-0 text-xl font-semibold">{loading ? "Opening the file…" : "Visit summary"}</h1>
        {!loading ? (
          <>
            <p role={message ? "alert" : undefined} className="m-0 text-sm text-muted">
              {message ?? "Choose a patient to see their visit summary."}
            </p>
            <ActionLink href={emrRoutes.patients} size="sm">Go to patients</ActionLink>
          </>
        ) : null}
      </Panel>
    );
  }
  return <VisitSummary key={patient.id} patient={patient} />;
}

function VisitSummary({ patient }: { patient: Patient }) {
  const me = useMe();
  const journey = usePatientJourney(patient);
  const form = usePatientResource(patient.id, loadHistoryForm, "Could not load the patient form.");
  const mrn = patient.file_number;
  const q = `?patient=${encodeURIComponent(mrn)}`;
  const scanHref = `${emrRoutes.scan}${q}`;

  const uterus = readAnswers(form.data?.answered?.answers).uterus;
  const meta = [
    journey.next ? `Next: ${visitTitle[journey.next.kind]} · ${formatDay(journey.next.starts_at)}` : "",
    form.data ? `Patient form: ${lowerFirst(formStatusText(form.data.latest))}` : "",
    uterus === "yes" ? "Uterus present" : uterus === "no" ? "No uterus" : "",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PatientHeader
        tab="summary"
        realPatient
        name={`${patient.full_name}, ${patient.age}`}
        mrn={mrn}
        initial={patient.full_name.charAt(0).toUpperCase()}
        meta={meta || undefined}
        actions={
          <>
            <ActionLink href={`${emrRoutes.exam}${q}`} size="md">
              Exam &amp; plan
            </ActionLink>
            <ActionLink href={`${emrRoutes.orders}${q}`} variant="quiet" size="md">
              Prescription / labs
            </ActionLink>
            <ActionLink href={`${emrRoutes.msgs}${q}`} variant="quiet" size="md">
              Email results
            </ActionLink>
            <ActionLink href={`${emrRoutes.msgs}${q}&compose=case`} variant="quiet" size="md">
              Request case by email
            </ActionLink>
          </>
        }
      />
      <JourneyTracker steps={journey.steps} error={journey.error} />
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-4">
        <div className="flex flex-col gap-4">
          <AlertsPanel patientId={patient.id} isLead={!!me?.is_lead} />
          <PatientFormPanel form={form.data} error={form.error} />
          {form.data ? <ModuleTabs form={form.data.answered} /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <RequestedFilesPanel patientId={patient.id} mrn={mrn} />
          <DocumentsPanel patientId={patient.id} mrn={mrn} scanHref={scanHref} />
          <KeyValuesPanel patientId={patient.id} />
          <SentOrdersPanel patientId={patient.id} mrn={mrn} />
          <EmailsPanel patientId={patient.id} mrn={mrn} />
        </div>
      </div>
    </>
  );
}
