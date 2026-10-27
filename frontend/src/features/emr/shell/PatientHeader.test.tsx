// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PatientHeader } from "./PatientHeader";

afterEach(cleanup);

it("does not link a real patient to demonstration charts and preserves the file number", () => {
  render(<PatientHeader tab="docs" realPatient name="Test patient" mrn="VC-000007" />);
  expect(screen.getByRole("link", { name: "Diagnoses" }).getAttribute("href")).toBe("/emr/diagnoses?patient=VC-000007");
  expect(screen.getByRole("link", { name: "Documents" }).getAttribute("href")).toBe("/emr/docs?patient=VC-000007");
  expect(screen.getByRole("link", { name: "Emails" }).getAttribute("href")).toBe("/emr/msgs?patient=VC-000007");
  expect(screen.getByRole("link", { name: "Exam & plan" }).getAttribute("href")).toBe("/emr/exam?patient=VC-000007");
  expect(screen.queryByRole("link", { name: "Summary" })).toBeNull();
});

it("labels example charts and does not link their example number to real patient services", () => {
  render(<PatientHeader tab="summary" />);
  expect(screen.getByRole("status").textContent).toContain("Demonstration data");
  expect(screen.queryByRole("link", { name: "Diagnoses" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Documents" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Emails" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Exam & plan" })).toBeNull();
});
