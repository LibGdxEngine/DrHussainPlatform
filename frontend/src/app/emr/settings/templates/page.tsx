import { TemplatesScreen } from "@/features/emr/settings/components/TemplatesScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Email templates · V-Clinic EMR" };

export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string | string[] }> }) {
  const { template } = await searchParams;
  return (
    <AppShell active="rules" showPromo={false}>
      <TemplatesScreen initialId={typeof template === "string" ? template : undefined} />
    </AppShell>
  );
}
