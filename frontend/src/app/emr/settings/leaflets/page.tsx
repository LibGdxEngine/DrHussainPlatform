import { LeafletsScreen } from "@/features/emr/settings/components/LeafletsScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Leaflets · V-Clinic EMR" };

export default function Page() {
  return (
    <AppShell active="rules" showPromo={false}>
      <LeafletsScreen />
    </AppShell>
  );
}
