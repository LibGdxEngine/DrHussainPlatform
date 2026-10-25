import { LabTestsScreen } from "@/features/emr/settings/components/LabTestsScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Lab tests and targets · V-Clinic EMR" };

export default function Page() {
  return (
    <AppShell active="rules" showPromo={false}>
      <LabTestsScreen />
    </AppShell>
  );
}
