import { PrescriptionsScreen } from "@/features/emr/settings/components/PrescriptionsScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Prescriptions · V-Clinic EMR" };

export default function Page() {
  return (
    <AppShell active="rules" showPromo={false}>
      <PrescriptionsScreen />
    </AppShell>
  );
}
