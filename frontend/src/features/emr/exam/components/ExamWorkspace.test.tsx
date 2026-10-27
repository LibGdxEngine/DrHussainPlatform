// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { alertsApi } from "@/lib/api/emr/alerts";
import { contentApi, type AlertRule } from "@/lib/api/emr/content";
import { examinationsApi, type Examination } from "@/lib/api/emr/examinations";
import type { Patient } from "@/lib/api/emr/patients";
import { ExamWorkspace } from "./ExamWorkspace";

vi.mock("@/lib/api/emr/examinations", () => ({ examinationsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/api/emr/content", () => ({ contentApi: { alertRules: { list: vi.fn() } } }));
vi.mock("@/lib/api/emr/alerts", () => ({ alertsApi: { list: vi.fn(), acknowledge: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(alertsApi.list).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  vi.mocked(contentApi.alertRules.list).mockResolvedValue([r20]);
});

const patient = { id: "patient-1", full_name: "Test patient" } as Patient;
const r20 = {
  id: "rule-20", code: "R20", field: "Blood pressure", threshold_a: "140", threshold_b: "90", level: "amber",
  message: "Recheck before HRT", enabled: true, vital: "blood_pressure", lab_check: "gte", lab_test_code: "",
} as AlertRule;
const exam: Examination = {
  id: "exam-1", patient: "patient-1", examined_on: "2026-10-20", bp1_systolic: 144, bp1_diastolic: 92,
  bp2_systolic: null, bp2_diastolic: null, height_cm: "162.0", weight_kg: "81.0", waist_cm: null,
  bp_average: { systolic: 144, diastolic: 92 }, bmi: "30.9", breast_exam: "", pelvic_exam: "", screening: {},
  plan: "investigate", plan_notes: "", next_review: null, send_follow_up_form: false, version: 1,
  revisions: [{ number: 1, data: {}, author_name: "Doctor", created_at: "2026-10-20T10:00:00Z" }],
  created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z",
};

it("warns live with the clinic's cut-off and saves the typed examination", async () => {
  vi.mocked(examinationsApi.list).mockResolvedValue([]);
  vi.mocked(examinationsApi.create).mockResolvedValue(exam);
  render(<ExamWorkspace patient={patient} />);
  await screen.findByText("No examinations recorded yet.");
  fireEvent.change(screen.getByLabelText("BP · Reading 1"), { target: { value: "144/92" } });
  fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "162" } });
  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "81" } });
  expect(await screen.findByText(/BP 144\/92 ≥ 140\/90: Recheck before HRT/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Breast exam"), { target: { value: "No masses." } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Cervical smear up to date" }));
  fireEvent.click(screen.getByRole("button", { name: "Investigate first" }));
  fireEvent.click(screen.getByRole("button", { name: "Save examination" }));
  await waitFor(() => expect(examinationsApi.create).toHaveBeenCalledWith("patient-1", expect.objectContaining({
    bp1_systolic: 144, bp1_diastolic: 92, bp2_systolic: null, height_cm: "162", weight_kg: "81", waist_cm: null,
    breast_exam: "No masses.", screening: { smear: true }, plan: "investigate",
  })));
  expect(await screen.findByText("Examination saved.")).toBeTruthy();
  expect(screen.getByText("History (1)")).toBeTruthy();
  // The alert list reloads so the alert the server just raised shows.
  expect(vi.mocked(alertsApi.list).mock.calls.length).toBeGreaterThan(1);
});

it("refuses a blood pressure that is not two numbers", async () => {
  vi.mocked(examinationsApi.list).mockResolvedValue([]);
  render(<ExamWorkspace patient={patient} />);
  await screen.findByText("No examinations recorded yet.");
  fireEvent.change(screen.getByLabelText("BP · Reading 1"), { target: { value: "144" } });
  fireEvent.click(screen.getByRole("button", { name: "Save examination" }));
  expect((await screen.findByRole("alert")).textContent).toContain("120/80");
  expect(examinationsApi.create).not.toHaveBeenCalled();
});

it("keeps the draft and blocks resubmission when an edit is stale", async () => {
  vi.mocked(examinationsApi.list).mockResolvedValue([exam]);
  vi.mocked(examinationsApi.update).mockRejectedValue(new ApiError("Changed", 409, "EXAMINATION_CONFLICT"));
  render(<ExamWorkspace patient={patient} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  expect((screen.getByLabelText("BP · Reading 1") as HTMLInputElement).value).toBe("144/92");
  expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("162");
  fireEvent.change(screen.getByLabelText("Plan notes"), { target: { value: "My draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(examinationsApi.update).toHaveBeenCalledWith("exam-1", 1, expect.objectContaining({ plan_notes: "My draft" }));
  expect((screen.getByLabelText("Plan notes") as HTMLTextAreaElement).value).toBe("My draft");
  expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Reload examinations" })).toBeTruthy();
});
