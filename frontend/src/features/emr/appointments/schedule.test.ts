import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/emr/appointments";
import {
  addDays,
  dayKey,
  dayRange,
  formOutstanding,
  formState,
  groupBy,
  isDayKey,
  relativeDay,
  startsAt,
  weekOf,
} from "./schedule";

type FormFields = Pick<Appointment, "form_kind" | "form">;

function withForm(status: string, extra: Partial<NonNullable<Appointment["form"]>> = {}): FormFields {
  return {
    form_kind: "full",
    form: {
      id: "f1",
      kind: "full",
      status,
      sent_at: null,
      sent_via: "",
      opened_at: null,
      submitted_at: null,
      mrs_total: null,
      ...extra,
    },
  };
}

describe("day keys", () => {
  it("validates YYYY-MM-DD", () => {
    expect(isDayKey("2026-10-27")).toBe(true);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("27/10/2026")).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayRange("2026-10-30", 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("formats a local date", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("starts the clinic week on Saturday", () => {
    // 27 Oct 2026 is a Tuesday.
    const week = weekOf("2026-10-27");
    expect(week[0]).toBe("2026-10-24");
    expect(week).toHaveLength(7);
    expect(week[6]).toBe("2026-10-30");
    expect(weekOf("2026-10-24")[0]).toBe("2026-10-24");
    expect(weekOf("2026-10-30")[0]).toBe("2026-10-24");
  });

  it("names today and tomorrow", () => {
    expect(relativeDay("2026-10-27", "2026-10-27")).toBe("Today");
    expect(relativeDay("2026-10-28", "2026-10-27")).toBe("Tomorrow");
    expect(relativeDay("2026-10-29", "2026-10-27")).toContain("29 Oct");
  });

  it("builds the timestamp from local date and time", () => {
    const iso = startsAt("2026-10-28", "11:00");
    const local = new Date(iso);
    expect(dayKey(local)).toBe("2026-10-28");
    expect([local.getHours(), local.getMinutes()]).toEqual([11, 0]);
  });
});

describe("form state", () => {
  it("knows which visits need a form", () => {
    expect(formState({ form_kind: "", form: null })).toBe("none");
    expect(formState({ form_kind: "full", form: null })).toBe("notSent");
  });

  it("follows the latest form", () => {
    expect(formState(withForm("not_started"))).toBe("notSent");
    expect(formState(withForm("not_started", { sent_at: "2026-10-20T08:00:00Z" }))).toBe("notStarted");
    expect(formState(withForm("not_started", { sent_at: "2026-10-20T08:00:00Z", opened_at: "2026-10-21T08:00:00Z" }))).toBe("opened");
    expect(formState(withForm("in_progress"))).toBe("inProgress");
    expect(formState(withForm("complete"))).toBe("complete");
    expect(formState(withForm("locked"))).toBe("locked");
  });

  it("counts only forms still to fill in as outstanding", () => {
    expect(formOutstanding("none")).toBe(false);
    expect(formOutstanding("complete")).toBe(false);
    expect(formOutstanding("opened")).toBe(true);
  });
});

describe("groupBy", () => {
  it("keeps first-seen order", () => {
    const groups = groupBy(["b1", "a1", "b2"], (s) => s[0]);
    expect(groups).toEqual([
      { key: "b", items: ["b1", "b2"] },
      { key: "a", items: ["a1"] },
    ]);
  });
});
