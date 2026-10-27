// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PatientHeader } from "./PatientHeader";

afterEach(cleanup);

it("links every chart tab to the same real patient", () => {
  render(<PatientHeader tab="docs" realPatient name="Test patient" mrn="VC-000007" />);
  const expected: Record<string, string> = {
    Summary: "/emr/visit",
    "Exam & plan": "/emr/exam",
    "Orders & prescriptions": "/emr/orders",
    Diagnoses: "/emr/diagnoses",
    Documents: "/emr/docs",
    Emails: "/emr/msgs",
    "Trends & follow-up": "/emr/followup",
  };
  for (const [name, path] of Object.entries(expected)) {
    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(`${path}?patient=VC-000007`);
  }
  expect(screen.queryByRole("status")).toBeNull();
});

it("labels example charts and does not link their example number to real patient services", () => {
  render(<PatientHeader tab="summary" />);
  expect(screen.getByRole("status").textContent).toContain("Demonstration data");
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});
