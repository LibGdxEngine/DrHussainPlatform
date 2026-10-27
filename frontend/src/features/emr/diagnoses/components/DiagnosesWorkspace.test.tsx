// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { diagnosesApi, type Diagnosis } from "@/lib/api/emr/diagnoses";
import type { Patient } from "@/lib/api/emr/patients";
import { DiagnosesWorkspace } from "./DiagnosesWorkspace";

vi.mock("@/lib/api/emr/diagnoses", () => ({ diagnosesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const patient = { id: "patient-1", full_name: "Test patient" } as Patient;
const record: Diagnosis = {
  id: "diagnosis-1", patient: "patient-1", name: "Custom condition", status: "suspected",
  noted_on: "2026-01-20", notes: "Initial note", version: 1,
  created_at: "2026-01-20T12:00:00Z", updated_at: "2026-01-20T12:00:00Z",
  revisions: [{ number: 1, name: "Custom condition", status: "suspected", noted_on: "2026-01-20",
    notes: "Initial note", author_name: "Doctor", created_at: "2026-01-20T12:00:00Z" }],
};

it("adds a free-text diagnosis with status, date and notes to the selected patient", async () => {
  vi.mocked(diagnosesApi.list).mockResolvedValue([]);
  vi.mocked(diagnosesApi.create).mockResolvedValue(record);
  render(<DiagnosesWorkspace patient={patient} />);
  await screen.findByText("No diagnoses recorded yet.");
  fireEvent.change(screen.getByLabelText("Diagnosis"), { target: { value: "Custom condition" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "suspected" } });
  fireEvent.change(screen.getByLabelText("Date noted (optional)"), { target: { value: "2026-01-20" } });
  fireEvent.change(screen.getByLabelText("Clinical notes (optional)"), { target: { value: "Initial note" } });
  fireEvent.click(screen.getByRole("button", { name: "Add diagnosis" }));
  await waitFor(() => expect(diagnosesApi.create).toHaveBeenCalledWith("patient-1", {
    name: "Custom condition", status: "suspected", noted_on: "2026-01-20", notes: "Initial note",
  }));
  expect(await screen.findByText("Diagnosis saved.")).toBeTruthy();
  expect(screen.getByText("History (1)")).toBeTruthy();
  expect(screen.getByText(/Version 1/).textContent).toContain("Doctor");
});

it("keeps the draft and blocks resubmission when an edit is stale", async () => {
  vi.mocked(diagnosesApi.list).mockResolvedValue([record]);
  vi.mocked(diagnosesApi.update).mockRejectedValue(new ApiError("Record changed", 409, "DIAGNOSIS_CONFLICT"));
  render(<DiagnosesWorkspace patient={patient} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Clinical notes (optional)"), { target: { value: "My draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(diagnosesApi.update).toHaveBeenCalledWith("diagnosis-1", 1, expect.objectContaining({ notes: "My draft" }));
  expect((screen.getByLabelText("Clinical notes (optional)") as HTMLTextAreaElement).value).toBe("My draft");
  expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Reload diagnoses" })).toBeTruthy();
});

it("updates the selected diagnosis and displays both saved versions", async () => {
  const confirmed: Diagnosis = {
    ...record, status: "confirmed", notes: "Confirmed note", version: 2,
    revisions: [
      { ...record.revisions[0], number: 2, status: "confirmed", notes: "Confirmed note", author_name: "Second doctor" },
      record.revisions[0],
    ],
  };
  vi.mocked(diagnosesApi.list).mockResolvedValue([record]);
  vi.mocked(diagnosesApi.update).mockResolvedValue(confirmed);
  render(<DiagnosesWorkspace patient={patient} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "confirmed" } });
  fireEvent.change(screen.getByLabelText("Clinical notes (optional)"), { target: { value: "Confirmed note" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(diagnosesApi.update).toHaveBeenCalledWith("diagnosis-1", 1, {
    name: "Custom condition", status: "confirmed", noted_on: "2026-01-20", notes: "Confirmed note",
  }));
  expect(await screen.findByText("History (2)")).toBeTruthy();
  expect(screen.getByText(/Version 2/).textContent).toContain("Second doctor");
  expect(screen.getByText(/Version 1/).textContent).toContain("Doctor");
  expect(screen.getByText("Initial note")).toBeTruthy();
});

it("does not allow entry when access to the patient's diagnoses is denied", async () => {
  vi.mocked(diagnosesApi.list).mockRejectedValue(new ApiError("Only the doctor can do this.", 403, "permission_denied"));
  render(<DiagnosesWorkspace patient={patient} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Only the doctor");
  expect((screen.getByRole("button", { name: "Add diagnosis" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Diagnoses unavailable.")).toBeTruthy();
});
