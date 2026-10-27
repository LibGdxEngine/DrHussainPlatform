import { DocsScreen } from "@/features/emr/documents/components/DocsScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { patient } = await searchParams;

  return (
    <AppShell active="docs" showPromo={false}>
      <DocsScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
