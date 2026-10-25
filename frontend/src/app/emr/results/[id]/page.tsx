import { CaseScreen } from "@/features/emr/review/components/CaseScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Results case · V-Clinic EMR" };

export default async function ResultsCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell active="results" showPromo={false}>
      <CaseScreen caseId={id} />
    </AppShell>
  );
}
