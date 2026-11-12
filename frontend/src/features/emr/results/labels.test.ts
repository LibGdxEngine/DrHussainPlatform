import { describe, expect, it } from "vitest";
import type { CheckReason, ResultComparison } from "@/lib/api/emr/results";
import { actionText } from "../audit/data";
import { alertSourceLabel, changeLabel, checkReasonLabel, comparisonNotes, flagReason, needsCheck } from "./labels";

const reasons: CheckReason[] = [
  "value_glued", "ambiguous_comma", "ref_leftover", "unit_missing", "name_unknown", "split_line", "ocr_low_confidence",
];

describe("checkReasonLabel", () => {
  it("explains every check reason the reader can give", () => {
    const texts = reasons.map(checkReasonLabel);
    for (const [i, text] of texts.entries()) {
      expect(text).not.toContain(reasons[i]);
      expect(text).toMatch(/\.$/);
    }
    expect(new Set(texts).size).toBe(reasons.length);
  });

  it("falls back for a missing or new reason", () => {
    expect(checkReasonLabel(undefined)).toBe("The value was read with doubt.");
    expect(checkReasonLabel("")).toBe("The value was read with doubt.");
    expect(checkReasonLabel("brand_new_reason")).toBe("brand new reason");
  });
});

describe("needsCheck", () => {
  it("is true only until the doctor has checked the value", () => {
    expect(needsCheck({ needs_check: true, checked_at: null })).toBe(true);
    expect(needsCheck({ needs_check: true, checked_at: "2026-11-01T10:00:00Z" })).toBe(false);
    expect(needsCheck({ needs_check: false })).toBe(false);
  });
});

describe("comparisons", () => {
  const comparison = (overrides: Partial<ResultComparison>): ResultComparison => ({
    change: "up", reasons: [], notes: [], labs: [], previous: null, ...overrides,
  });

  it("names both labs when a comparison crosses labs", () => {
    expect(comparisonNotes(comparison({ notes: ["lab_differs"], labs: ["Lab One", "Lab Two"] }))).toEqual([
      "Different lab: Lab One now, Lab Two before",
    ]);
    expect(comparisonNotes(comparison({ notes: ["lab_differs"] }))).toEqual(["Different lab"]);
    expect(comparisonNotes(comparison({}))).toEqual([]);
  });

  it("still marks unit and range differences as not compared", () => {
    expect(changeLabel(comparison({ change: "not_comparable", reasons: ["unit_differs", "reference_range_differs"] }))).toBe(
      "Not compared: different unit, different reference range",
    );
    expect(changeLabel(comparison({ change: "up", notes: ["lab_differs"] }))).toBe("Higher");
  });
});

describe("labels for new codes", () => {
  it("covers the uncertain_value report flag, alert sources and the new audit actions", () => {
    expect(flagReason("uncertain_value")).not.toContain("_");
    expect(alertSourceLabel("answer")).toBe("From the patient's form answers");
    expect(alertSourceLabel("lab")).toBe("From lab results");
    expect(alertSourceLabel("vital")).toBe("From an examination");
    expect(actionText("result_value.checked")).toBe("Checked a result value");
    expect(actionText("patient_alerts.evaluated")).toBe("Checked alert rules for patient");
  });
});
