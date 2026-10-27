import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/emr/appointments";
import type { RequestedTest } from "@/lib/api/emr/orders";
import { bulkRowState, fileTitle, localDay, newScanFile, scanChecklist, scanQueue, type BulkRow } from "./data";

function visit(id: string, starts_at: string, status: Appointment["status"], needs_scanning = true): Appointment {
  return { id, starts_at, status, needs_scanning } as Appointment;
}

function test(id: string, status: RequestedTest["status"], arrived_at: string | null, requested_at = "2026-10-20T08:00:00Z"): RequestedTest {
  return { id, status, arrived_at, requested_at, name: id } as RequestedTest;
}

describe("scanQueue", () => {
  it("keeps visits that bring files, checked-in first, then by time", () => {
    const list = scanQueue([
      visit("late", "2026-10-27T11:00:00Z", "checked_in"),
      visit("booked", "2026-10-27T08:00:00Z", "booked"),
      visit("early", "2026-10-27T09:00:00Z", "checked_in"),
      visit("none", "2026-10-27T07:00:00Z", "checked_in", false),
      visit("seen", "2026-10-27T07:30:00Z", "seen"),
    ]);
    expect(list.map((a) => a.id)).toEqual(["early", "late", "booked"]);
  });
});

describe("scanChecklist", () => {
  it("shows waiting tests and ones that arrived today", () => {
    const today = localDay(new Date());
    const now = new Date().toISOString();
    const list = scanChecklist([
      test("old", "clinic", "2020-01-01T10:00:00Z"),
      test("waiting", "pending", null),
      test("today", "clinic", now),
    ], today);
    expect(list.map((t) => t.id).sort()).toEqual(["today", "waiting"]);
  });
});

describe("files", () => {
  it("names a file after its file name", () => {
    expect(fileTitle("scan_0412.pdf")).toBe("scan_0412");
    expect(fileTitle(".pdf")).toBe(".pdf");
  });

  it("formats a local day", () => {
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("tells what a bulk row still needs", () => {
    const row: BulkRow = { ...newScanFile(new File(["x"], "a.pdf"), ""), patient: null };
    expect(bulkRowState(row)).toBe("needs_patient");
    const withPatient = { ...row, patient: { id: "p", file_number: "VC-1", full_name: "A" } };
    expect(bulkRowState(withPatient)).toBe("needs_category");
    expect(bulkRowState({ ...withPatient, slot: "lab" })).toBe("ready");
    expect(bulkRowState({ ...withPatient, slot: "lab", status: "error" })).toBe("error");
    expect(bulkRowState({ ...row, status: "saved" })).toBe("saved");
  });
});
