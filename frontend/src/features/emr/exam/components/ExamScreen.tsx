import { AppShell } from "../../shell/AppShell";
import { PatientHeader } from "../../shell/PatientHeader";
import { examFlag, examMeta } from "../data";
import { ExamAside } from "./ExamAside";
import { ExamMain } from "./ExamMain";

export function ExamScreen() {
  return (
    <AppShell active="patients">
      <PatientHeader tab="exam" meta={examMeta} flag={examFlag} />
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4">
        <ExamMain />
        <ExamAside />
      </div>
    </AppShell>
  );
}
