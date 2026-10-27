import { InboxScreen } from "@/features/emr/messages/components/InboxScreen";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Inbox · V-Clinic EMR" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return (
    <AppShell active="msgs" showPromo={false}>
      <InboxScreen
        patientMrn={one(sp.patient)}
        threadId={one(sp.thread)}
        compose={one(sp.compose) === "case" ? "case" : undefined}
      />
    </AppShell>
  );
}
