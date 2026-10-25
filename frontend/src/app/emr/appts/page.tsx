import { AppointmentsTable } from "@/features/emr/appointments/components/AppointmentsTable";
import { BookingForm } from "@/features/emr/appointments/components/BookingForm";
import { DayPicker } from "@/features/emr/appointments/components/DayPicker";
import { StaffHeader } from "@/features/emr/appointments/components/StaffHeader";
import { AppShell } from "@/features/emr/shell/AppShell";

export default function AppointmentsPage() {
  return (
    <AppShell active="appts" showPromo={false}>
      <StaffHeader />
      <DayPicker />
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
        <AppointmentsTable />
        <BookingForm />
      </div>
    </AppShell>
  );
}
