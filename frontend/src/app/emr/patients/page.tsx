import { AppShell } from "@/features/emr/shell/AppShell";
import { PageTitle } from "@/features/emr/shell/PageTitle";
import { PatientsScreen } from "@/features/emr/patients/components/PatientsScreen";

export default function PatientsPage() {
  return (
    <AppShell active="patients" topbarStart={<PageTitle title="Patients" meta="Clinic files" />}>
      <PatientsScreen />
    </AppShell>
  );
}
