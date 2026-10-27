import { AppShell } from "@/features/emr/shell/AppShell";
import { AuditScreen } from "@/features/emr/audit/components/AuditScreen";

export const metadata = { title: "Audit log · V-Clinic EMR" };

export default function AuditPage() {
  return (
    <AppShell active="audit" showPromo={false}>
      <AuditScreen />
    </AppShell>
  );
}
