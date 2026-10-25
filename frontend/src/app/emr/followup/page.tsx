import { DoctorPanel } from "@/features/emr/followup/components/DoctorPanel";
import { MrsSummary } from "@/features/emr/followup/components/MrsSummary";
import { PatientAnswers } from "@/features/emr/followup/components/PatientAnswers";
import { TrendPanel } from "@/features/emr/followup/components/TrendPanel";
import { JourneyTracker } from "@/features/emr/journey/components/JourneyTracker";
import { followupJourney } from "@/features/emr/journey/data";
import { AppShell } from "@/features/emr/shell/AppShell";
import { PatientHeader } from "@/features/emr/shell/PatientHeader";

export default function FollowupPage() {
  return (
    <AppShell active="patients" showPromo={false}>
      <PatientHeader
        tab="trends"
        name="Nour Saleh, 47"
        mrn="VC-000118"
        initial="N"
        meta="3-month review after starting HRT · Follow-up form completed 12 Oct · Uterus present"
      />
      <JourneyTracker steps={followupJourney} compact />
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
