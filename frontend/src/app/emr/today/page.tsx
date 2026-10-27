import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientQuickSearch } from "@/features/emr/today/components/PatientQuickSearch";
import { TodayDashboard } from "@/features/emr/today/components/TodayDashboard";

export const metadata = { title: "Today · V-Clinic EMR" };

export default function TodayPage() {
  return (
    <AppShell active="today" topbarStart={<PatientQuickSearch className="max-w-[440px]" />} showMessages>
      <TodayDashboard />
    </AppShell>
  );
}
