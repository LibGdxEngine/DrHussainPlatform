"use client";

import { useCallback, useMemo, useState } from "react";
import { appointmentsApi, type Appointment } from "@/lib/api/emr/appointments";
import { useLoad, useToday } from "../hooks";
import { dayOf, dayRange } from "../schedule";
import { AppointmentsTable } from "./AppointmentsTable";
import { BookingForm } from "./BookingForm";
import { DayPicker } from "./DayPicker";
import { StaffHeader } from "./StaffHeader";

const UPCOMING_DAYS = 7;

interface AppointmentsScreenProps {
  /** `?date=YYYY-MM-DD`, already validated. */
  initialDate?: string;
  /** `?patient=VC-…`: preselected in the booking form. */
  initialPatient?: string;
}

export function AppointmentsScreen({ initialDate, initialPatient }: AppointmentsScreenProps) {
  const today = useToday();
  const [picked, setPicked] = useState<string | undefined>(initialDate);
  const [version, setVersion] = useState(0);
  const day = picked ?? today;

  const select = (next: string) => {
    setPicked(next);
    const params = new URLSearchParams(window.location.search);
    params.set("date", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const days = useMemo(() => {
    if (!today) return [];
    const list = dayRange(today, UPCOMING_DAYS);
    return day && !list.includes(day) ? [...list, day].sort() : list;
  }, [today, day]);

  const first = days[0];
  const last = days[days.length - 1];
  const loadCounts = useCallback(
    // version is a reload trigger only.
    () => (version >= 0 && first && last ? appointmentsApi.days(first, last) : Promise.resolve([])),
    [first, last, version],
  );
  const counts = useLoad(first ? loadCounts : null, "Could not load the visit counts.");
  const countMap = useMemo(
    () => (counts.data ? new Map(counts.data.map((c) => [c.date, c.count])) : undefined),
    [counts.data],
  );

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const booked = (a: Appointment) => {
    select(dayOf(a.starts_at));
    changed();
  };

  return (
    <>
      <StaffHeader />
      <DayPicker days={days} selected={day} counts={countMap} today={today} onSelect={select} />
      {counts.error ? (
        <p role="alert" className="m-0 text-sm text-danger-ink">{counts.error}</p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AppointmentsTable day={day} version={version} onChanged={changed} />
        <BookingForm today={today} day={day} initialFileNumber={initialPatient} onBooked={booked} />
      </div>
    </>
  );
}
