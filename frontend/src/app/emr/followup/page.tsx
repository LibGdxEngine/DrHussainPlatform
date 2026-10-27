import { FollowupScreen } from "@/features/emr/followup/components/FollowupScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Trends & follow-up · V-Clinic EMR" };

export default async function FollowupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { patient } = await searchParams;

  return (
    <AppShell active="patients" showPromo={false}>
      <FollowupScreen fileNumber={Array.isArray(patient) ? patient[0] : patient} />
    </AppShell>
  );
}
