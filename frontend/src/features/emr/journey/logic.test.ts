import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/emr/appointments";
import { appointmentStatus, buildJourney, nextVisit } from "./logic";

// Local-time dates, so "today" holds in any time zone the tests run in.
const now = new Date(2026, 9, 27, 11, 0);
const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour).toISOString();

function visit(id: string, kind: Appointment["kind"], startsAt: string, status: Appointment["status"] = "booked"): Appointment {
  return {
    id,
    patient: { id: "p1", file_number: "VC-000001", full_name: "Test", age: 50, has_email: true },
    starts_at: startsAt,
    duration_minutes: 45,
    kind,
    kind_label: kind,
    reason: "",
    notes: "",
    status,
    form_kind: "",
    needs_scanning: false,
    form: null,
    checked_in_at: null,
    checked_in_by_name: "",
    created_at: startsAt,
  };
}

const patient = { created_at: at(9, 1), first_contact_channel: "whatsapp" as const };

describe("appointmentStatus", () => {
  it("reads seen, no-show, today, future and past-but-unmarked visits", () => {
    expect(appointmentStatus({ status: "seen", starts_at: at(9, 2) }, now)).toBe("done");
    expect(appointmentStatus({ status: "no_show", starts_at: at(9, 2) }, now)).toBe("missed");
    expect(appointmentStatus({ status: "booked", starts_at: at(9, 27, 16) }, now)).toBe("current");
    expect(appointmentStatus({ status: "checked_in", starts_at: at(9, 27, 9) }, now)).toBe("current");
    expect(appointmentStatus({ status: "booked", starts_at: at(10, 3) }, now)).toBe("upcoming");
    expect(appointmentStatus({ status: "booked", starts_at: at(9, 20) }, now)).toBe("unrecorded");
  });
});

describe("buildJourney", () => {
  it("starts with first contact and asks for a first visit when none is booked", () => {
    const steps = buildJourney({ created_at: at(9, 1) }, [], now);
    expect(steps.map((s) => [s.id, s.status, s.detail])).toEqual([
      ["contact", "done", "Channel not recorded"],
      ["first-visit", "planned", "Not booked yet"],
    ]);
  });

  it("lists visits oldest first, skips cancelled ones and adds the due follow-up", () => {
    const steps = buildJourney(
      patient,
      [
        visit("v2", "visit2", at(9, 13), "seen"),
        visit("v1", "visit1", at(9, 6), "seen"),
        visit("x", "visit3", at(9, 20), "cancelled"),
      ],
      now,
    );
    expect(steps.map((s) => s.id)).toEqual(["contact", "v1", "v2", "next-follow-up"]);
    expect(steps[0].detail).toBe("WhatsApp");
    expect(steps[2].title).toBe("Visit 2");
    expect(steps[3]).toMatchObject({ status: "planned", date: "Due 13 Jan 2027" });
  });

  it("leaves the follow-up date open while another visit is still to come", () => {
    const steps = buildJourney(patient, [visit("v1", "visit1", at(9, 6), "seen"), visit("v2", "visit2", at(9, 27, 15))], now);
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "current", "planned"]);
    expect(steps[3].date).toBe("After the last visit");
  });

  it("adds no planned step when a follow-up is already booked", () => {
    const steps = buildJourney(patient, [visit("v1", "visit1", at(6, 6), "seen"), visit("f", "followup_3m", at(10, 6))], now);
    expect(steps.map((s) => s.id)).toEqual(["contact", "v1", "f"]);
    expect(steps[2]).toMatchObject({ title: "3-month follow-up", status: "upcoming" });
  });
});

describe("nextVisit", () => {
  it("prefers today's visit over a later one", () => {
    const today = visit("t", "visit2", at(9, 27, 15));
    const later = visit("l", "visit3", at(10, 3));
    expect(nextVisit([later, today], now)?.id).toBe("t");
    expect(nextVisit([later, visit("s", "visit1", at(9, 6), "seen")], now)?.id).toBe("l");
  });
});
