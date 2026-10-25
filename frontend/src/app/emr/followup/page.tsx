import { DoctorPanel } from "@/features/emr/followup/components/DoctorPanel";
import { MrsSummary } from "@/features/emr/followup/components/MrsSummary";
import { PatientAnswers } from "@/features/emr/followup/components/PatientAnswers";
import { TrendPanel } from "@/features/emr/followup/components/TrendPanel";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function FollowupPage() {
  return (
    <AppShell active="patients" showPromo={false}>
      <PatientHeader
        tab="trends"
        name="نور صالح، 47"
        mrn="VC-000118"
        initial="ن"
        meta="مراجعة بعد 3 شهور من بداية HRT · استمارة المتابعة اتملت 12 أكتوبر · الرحم موجود"
      />
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
        <div className="flex flex-col gap-4">
          <TrendPanel />
          <div className="grid grid-cols-2 gap-4">
            <MrsSummary />
            <PatientAnswers />
          </div>
        </div>
        <DoctorPanel />
      </div>
    </AppShell>
  );
}
