import { TemplatesScreen } from "@/features/emr/settings/components/TemplatesScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Email templates · V-Clinic EMR" };

export default function Page() {
  return (
    <AppShell active="rules" showPromo={false}>
      <TemplatesScreen />
    </AppShell>
  );
}
