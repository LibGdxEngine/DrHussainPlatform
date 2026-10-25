import { AppShell } from "@/features/emr/shell/AppShell";
import { PageTitle } from "@/features/emr/shell/PageTitle";
import { NewPatientForm } from "@/features/emr/patients/components/NewPatientForm";
import { PatientsBrowser } from "@/features/emr/patients/components/PatientsBrowser";
import { totalPatients } from "@/features/emr/patients/data";

export default function PatientsPage() {
  return (
    <AppShell active="patients" topbarStart={<PageTitle title="Patients" meta={`${totalPatients} files`} />}>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PatientsBrowser />
        <NewPatientForm />
      </div>
    </AppShell>
  );
}
