import { AppShell } from "@/features/emr/shell/AppShell";
import { VisitScreen } from "@/features/emr/visit/components/VisitScreen";

export const metadata = { title: "Visit summary · V-Clinic EMR" };

export default async function VisitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { patient } = await searchParams;

  return (
    <AppShell active="patients">
      <VisitScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
