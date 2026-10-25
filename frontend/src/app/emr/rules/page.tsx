import { RulesBoard } from "@/features/emr/rules/components/RulesBoard";
import { AppShell } from "@/features/emr/shell/AppShell";

export default function RulesPage() {
  return (
    <AppShell active="rules" showPromo={false}>
      <RulesBoard />
    </AppShell>
  );
}
