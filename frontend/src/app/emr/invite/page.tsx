import { AppShell } from "@/features/emr/shell/AppShell";
import { InviteScreen } from "@/features/emr/invite/components/InviteScreen";

export const metadata = { title: "ادعُ مستخدم · V-Clinic EMR" };

export default function InvitePage() {
  return (
    <AppShell active="audit" showPromo={false}>
      <InviteScreen />
    </AppShell>
  );
}
