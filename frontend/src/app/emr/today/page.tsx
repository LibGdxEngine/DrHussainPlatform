import { emrRoutes } from "@/features/emr/routes";
import { AppShell } from "@/features/emr/shell/AppShell";
import { SearchBox } from "@/features/emr/shell/SearchBox";
import { ActionLink } from "@/features/emr/ui/Action";
import { Icon } from "@/features/emr/ui/icons";
import { Panel } from "@/features/emr/ui/Panel";
import { FormGauge } from "@/features/emr/today/components/FormGauge";
import { NextVisitCard } from "@/features/emr/today/components/NextVisitCard";
import { FollowupsPanel, PatientRepliesPanel, RemindersPanel } from "@/features/emr/today/components/SidePanels";
import { StatCard } from "@/features/emr/today/components/StatCard";
import { VisitsTable } from "@/features/emr/today/components/VisitsTable";
import { WeekChart } from "@/features/emr/today/components/WeekChart";
import { todayStats, todayVisits, weekDays } from "@/features/emr/today/data";

export default function TodayPage() {
  const first = todayVisits[0];
  return (
    <AppShell
      active="today"
      topbarStart={
        <SearchBox
          className="max-w-[440px]"
          label="Search patients"
          placeholder="Search by patient name, mobile or MRN"
        />
      }
      showMessages
      doctorSubtitle="hsgohar@gmail.com"
      doctorMono
    >
      <Panel className="flex flex-1 flex-col gap-5 p-7">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[34px] font-bold">Good morning, doctor</h1>
            <p className="m-0 text-[15px] text-muted">
              Tuesday 13 Oct · 9 visits today · 6 patients completed the form · First visit 09:30
            </p>
          </div>
          <div className="ms-auto flex gap-2.5">
            <ActionLink href={emrRoutes.patients}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              New patient
            </ActionLink>
            <ActionLink href={emrRoutes.patients} variant="outline">
              Send form link
            </ActionLink>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {todayStats.map((s) => (
            <StatCard key={s.title} stat={s} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_1.15fr_0.9fr]">
          <NextVisitCard
            time={first.time}
            name={`${first.name}, ${first.age}`}
            summary={first.visit}
            alerts={first.alerts}
            href={emrRoutes.visit}
          />
          <WeekChart days={weekDays} total={53} />
          <FormGauge done={6} pending={3} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
          <VisitsTable visits={todayVisits} />
          <div className="flex flex-col gap-4">
            <FollowupsPanel />
            <PatientRepliesPanel />
            <RemindersPanel />
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
