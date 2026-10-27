import { DiagnosesScreen } from "@/features/emr/diagnoses/components/DiagnosesScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export default async function DiagnosesPage({ searchParams }: {
  searchParams: Promise<{ patient?: string | string[] }>;
}) {
  const { patient } = await searchParams;
  return (
    <AppShell active="patients" showPromo={false}>
      <DiagnosesScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
