import { describe, expect, it } from "vitest";
import type { PatientAlert } from "@/lib/api/emr/alerts";
import type { Appointment, AppointmentStatus, VisitKind } from "@/lib/api/emr/appointments";
import type { RequestedTest } from "@/lib/api/emr/orders";
import {
  alertCountsByPatient,
  alertsByPatient,
  formsSummary,
  nextVisit,
  redAlerts,
  testsByPatient,
  upcomingFollowups,
  weekBars,
} from "./summary";

function alert(id: string, patient: string, level: PatientAlert["level"]): PatientAlert {
  return { id, patient, level, message: id } as PatientAlert;
}

function visit(
  id: string,
  status: AppointmentStatus,
  kind: VisitKind = "visit1",
  form: Appointment["form"] = null,
): Appointment {
  const formKind = kind === "visit2" || kind === "visit3" ? "" : "full";
  return { id, status, kind, form_kind: formKind, form, patient: { id: `p-${id}` } } as Appointment;
}

function form(status: string, sent = true): Appointment["form"] {
  return {
    id: "f",
    kind: "full",
    status,
    sent_at: sent ? "2026-10-20T08:00:00Z" : null,
    sent_via: "email",
    opened_at: null,
    submitted_at: null,
    mrs_total: null,
  };
}

describe("alerts", () => {
  const alerts = [alert("a1", "p1", "amber"), alert("a2", "p2", "red"), alert("a3", "p1", "red"), alert("a4", "p1", "red")];

  it("counts by patient and level", () => {
    expect(alertCountsByPatient(alerts).get("p1")).toEqual({ amber: 1, red: 2 });
  });

  it("puts red alerts first", () => {
    const groups = alertsByPatient(alerts);
    expect(groups.map((g) => g.patient)).toEqual(["p2", "p1"]);
    expect(groups[1].alerts.map((a) => a.level)).toEqual(["red", "red", "amber"]);
  });

  it("summarises red alerts", () => {
    expect(redAlerts(alerts)).toEqual({ count: 3, patients: ["p2", "p1"] });
  });
});

describe("today's visits", () => {
  it("counts forms over visits still to be seen that need one", () => {
    const visits = [
      visit("1", "booked", "visit1", form("complete")),
      visit("2", "booked", "visit1", null),
      visit("3", "checked_in", "visit1", form("in_progress")),
      visit("4", "booked", "visit2"),
      visit("5", "no_show", "visit1", null),
    ];
    expect(formsSummary(visits)).toEqual({ needed: 3, complete: 1, pending: 2, notStarted: 1 });
  });

  it("picks a checked-in patient before later arrivals", () => {
    const visits = [visit("1", "seen"), visit("2", "booked"), visit("3", "checked_in")];
    expect(nextVisit(visits)?.id).toBe("3");
    expect(nextVisit([visit("1", "booked"), visit("2", "booked")])?.id).toBe("1");
    expect(nextVisit([visit("1", "seen")])).toBeNull();
  });

  it("keeps follow-ups still to come", () => {
    const visits = [
      visit("1", "booked", "followup_3m"),
      visit("2", "booked", "visit1"),
      visit("3", "cancelled", "annual_review"),
      visit("4", "booked", "annual_review"),
    ];
    expect(upcomingFollowups(visits).map((v) => v.id)).toEqual(["1", "4"]);
  });
});

describe("week bars", () => {
  it("fills missing days with zero and marks today", () => {
    const bars = weekBars(["2026-10-26", "2026-10-27", "2026-10-28"], [{ date: "2026-10-27", count: 4 }], "2026-10-27");
    expect(bars).toEqual([
      { day: "2026-10-26", count: 0, kind: "past" },
      { day: "2026-10-27", count: 4, kind: "today" },
      { day: "2026-10-28", count: 0, kind: "future" },
    ]);
  });
});

describe("tests to arrive", () => {
  it("groups by patient, oldest request first", () => {
    const tests = [
      { id: "t1", patient: "p1", requested_at: "2026-10-20T10:00:00Z" },
      { id: "t2", patient: "p2", requested_at: "2026-10-10T10:00:00Z" },
      { id: "t3", patient: "p1", requested_at: "2026-10-05T10:00:00Z" },
    ] as RequestedTest[];
    const groups = testsByPatient(tests);
    expect(groups.map((g) => [g.patient, g.tests.map((t) => t.id)])).toEqual([
      ["p1", ["t3", "t1"]],
      ["p2", ["t2"]],
    ]);
  });
});
