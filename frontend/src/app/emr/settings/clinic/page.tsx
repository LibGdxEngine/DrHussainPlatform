import { ClinicScreen } from "@/features/emr/settings/components/ClinicScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Clinic details · V-Clinic EMR" };

export default function Page() {
  return (
    <AppShell active="rules" showPromo={false}>
      <ClinicScreen />
    </AppShell>
  );
}
