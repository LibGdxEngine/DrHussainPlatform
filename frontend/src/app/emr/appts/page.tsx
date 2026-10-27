import { AppointmentsScreen } from "@/features/emr/appointments/components/AppointmentsScreen";
import { isDayKey } from "@/features/emr/appointments/schedule";
import { AppShell } from "@/features/emr/shell/AppShell";

export const metadata = { title: "Appointments · V-Clinic EMR" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const date = one(sp.date);
  return (
    <AppShell active="appts" showPromo={false}>
      <AppointmentsScreen initialDate={isDayKey(date) ? date : undefined} initialPatient={one(sp.patient) || undefined} />
    </AppShell>
  );
}
