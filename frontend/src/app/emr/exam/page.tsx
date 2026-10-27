import { ExamScreen } from "@/features/emr/exam/components/ExamScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Exam & plan · V-Clinic EMR" };

export default async function ExamPage({ searchParams }: {
  searchParams: Promise<{ patient?: string | string[] }>;
}) {
  const { patient } = await searchParams;
  return (
    <AppShell active="patients" showPromo={false}>
      <ExamScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
