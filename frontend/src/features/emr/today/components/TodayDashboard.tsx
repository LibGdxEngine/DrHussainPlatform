"use client";

import { useCallback, useMemo } from "react";
import { alertsApi } from "@/lib/api/emr/alerts";
import { appointmentsApi } from "@/lib/api/emr/appointments";
import { mailApi } from "@/lib/api/emr/mail";
import { ordersApi } from "@/lib/api/emr/orders";
import { reviewApi } from "@/lib/api/emr/review";
import { useLoad, useToday } from "@/features/emr/appointments/hooks";
import { addDays, dayTitle, localTime, weekOf } from "@/features/emr/appointments/schedule";
import { emrRoutes } from "@/features/emr/routes";
import { useMe } from "@/features/emr/shell/useMe";
import { ActionLink } from "@/features/emr/ui/Action";
import { Icon } from "@/features/emr/ui/icons";
import { Panel } from "@/features/emr/ui/Panel";
import {
  alertCountsByPatient,
  alertsByPatient,
  formsSummary,
  nextVisit,
  redAlerts,
  testsByPatient,
  upcomingFollowups,
  weekBars,
} from "../summary";
import { patientRefs } from "../patientRefs";
import { FormGauge } from "./FormGauge";
import { NextVisitCard } from "./NextVisitCard";
import { AlertsPanel, FollowupsPanel, PatientRepliesPanel, TestsToArrivePanel } from "./SidePanels";
import { StatCard, type TodayStat } from "./StatCard";
import { VisitsTable } from "./VisitsTable";
import { WeekChart } from "./WeekChart";

const FOLLOWUP_DAYS = 14;
const SHOWN_ALERT_PATIENTS = 6;
const SHOWN_TEST_PATIENTS = 5;

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The home screen: today's visits, what is waiting for the doctor, and what is still to come in. */
export function TodayDashboard() {
  const today = useToday();
  const me = useMe();

  // Requests that depend on the day wait until the browser's date is known.
  const week = useMemo(() => (today ? weekOf(today) : null), [today]);
  const visits = useLoad(
    useMemo(() => (today ? () => appointmentsApi.list({ date: today }) : null), [today]),
    "Could not load today's visits.",
  );
  const weekCounts = useLoad(
    useMemo(() => (week ? () => appointmentsApi.days(week[0], week[week.length - 1]) : null), [week]),
    "Could not load this week's visits.",
  );
  const followups = useLoad(
    useMemo(
      () => (today ? () => appointmentsApi.list({ from: today, to: addDays(today, FOLLOWUP_DAYS) }) : null),
      [today],
    ),
    "Could not load upcoming follow-ups.",
  );
  const alerts = useLoad(useCallback(() => alertsApi.list({ status: "open" }), []), "Could not load alerts.");
  const mailCounts = useLoad(useCallback(() => mailApi.threads.counts(), []), "Could not load the inbox.");
  const unread = useLoad(useCallback(() => mailApi.threads.list("inbox", "unread"), []), "Could not load the inbox.");
  const review = useLoad(useCallback(() => reviewApi.counts(), []), "Could not load the results queue.");
  const tests = useLoad(
    useCallback(() => ordersApi.requested.list({ status: "pending" }), []),
    "Could not load the requested tests.",
  );

  const todays = visits.data;
  const counts = useMemo(() => alertCountsByPatient(alerts.data ?? []), [alerts.data]);
  const alertGroups = useMemo(() => (alerts.data ? alertsByPatient(alerts.data) : undefined), [alerts.data]);
  const testGroups = useMemo(() => (tests.data ? testsByPatient(tests.data) : undefined), [tests.data]);
  const red = redAlerts(alerts.data ?? []);
  const forms = todays ? formsSummary(todays) : null;
  const next = todays ? nextVisit(todays) : undefined;

  const patients = useMemo(
    () => patientRefs(
      [...(visits.data ?? []), ...(followups.data ?? [])].map((v) => v.patient),
      alerts.data ?? [],
      tests.data ?? [],
    ),
    [visits.data, followups.data, alerts.data, tests.data],
  );

  const redPatient = red.patients.length === 1 ? patients.get(red.patients[0]) : undefined;
  const queue = review.data ? review.data.needs_doctor + review.data.ready : null;

  const stats: TodayStat[] = [
    {
      title: "Red alerts to confirm",
      value: alerts.data ? red.count : null,
      caption: red.count ? `Across ${plural(red.patients.length, "patient")}` : "Nothing urgent",
      href: redPatient ? `${emrRoutes.visit}?patient=${encodeURIComponent(redPatient.file_number)}` : "#alerts",
      error: alerts.error,
      highlight: true,
    },
    {
      title: "Forms not started",
      value: forms ? forms.notStarted : null,
      caption: forms
        ? forms.needed
          ? `${forms.complete} of ${forms.needed} complete for today`
          : "No forms due today"
        : "Loading…",
      href: emrRoutes.appts,
      error: visits.error,
    },
    {
      title: "Unread patient emails",
      value: mailCounts.data ? mailCounts.data.unread : null,
      caption: mailCounts.data?.unmatched
        ? `${plural(mailCounts.data.unmatched, "thread")} not matched to a patient`
        : "In the clinic inbox",
      href: emrRoutes.msgs,
      error: mailCounts.error,
    },
    {
      title: "Results waiting for the doctor",
      value: queue,
      caption: review.data ? `${review.data.needs_doctor} to look at · ${review.data.ready} ready to send` : "Loading…",
      href: emrRoutes.results,
      error: review.error,
    },
  ];

  const summary = todays
    ? [
        today ? dayTitle(today) : "",
        `${plural(todays.length, "visit")} today`,
        forms?.needed ? `${forms.complete} of ${forms.needed} forms complete` : "",
        todays[0] ? `First visit ${localTime(todays[0].starts_at)}` : "",
      ].filter(Boolean)
    : [today ? dayTitle(today) : "Loading…"];

  return (
    <Panel className="flex flex-1 flex-col gap-5 p-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[34px] font-bold">
            {today ? greeting() : "Hello"}
            {me?.name ? `, ${me.name}` : ""}
          </h1>
          <p className="m-0 text-[15px] text-muted">{summary.join(" · ")}</p>
        </div>
        <div className="ms-auto flex gap-2.5">
          <ActionLink href={emrRoutes.patients}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            New patient
          </ActionLink>
          <ActionLink href={emrRoutes.appts} variant="outline">
            Book a visit
          </ActionLink>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.title} stat={s} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1.15fr_0.9fr]">
        <NextVisitCard visit={visits.error ? null : next} alerts={next ? counts.get(next.patient.id) : undefined} />
        <WeekChart
          days={today && week && weekCounts.data ? weekBars(week, weekCounts.data, today) : undefined}
          error={weekCounts.error}
        />
        <FormGauge done={forms?.complete ?? null} pending={forms?.pending ?? null} error={visits.error} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <VisitsTable visits={todays} error={visits.error} alerts={counts} />
        <div className="flex flex-col gap-4">
          <AlertsPanel groups={alertGroups} error={alerts.error} patients={patients} limit={SHOWN_ALERT_PATIENTS} />
          <PatientRepliesPanel items={unread.data} error={unread.error} />
          <TestsToArrivePanel groups={testGroups} error={tests.error} patients={patients} limit={SHOWN_TEST_PATIENTS} />
          {today ? (
            <FollowupsPanel
              items={followups.data ? upcomingFollowups(followups.data) : undefined}
              error={followups.error}
              today={today}
            />
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
