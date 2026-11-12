import { describe, expect, it } from "vitest";
import type { AlertRule } from "@/lib/api/emr/content";
import {
  addMedicineTerm, cutoffNotSet, filterOptions, matchesFilter, MAX_MEDICINE_TERM_LENGTH, MAX_MEDICINE_TERMS, ruleChecks,
  sameTerms, usesMedicineTerms,
} from "./data";

const rule = (overrides: Partial<AlertRule>): AlertRule =>
  ({ id: "1", code: "R1", field: "", level: "red", message: "", version: 1, changed_at: "", changed_by_name: "", ...overrides }) as AlertRule;

describe("ruleChecks", () => {
  it("names each automatic check: answer, lab and vital", () => {
    expect(ruleChecks(rule({ answer_check: "smoking" }))).toEqual([{ kind: "answer", text: "Answer check: Smoker / vaper, 6B" }]);
    expect(ruleChecks(rule({ lab_check: "gt", lab_test_code: "testosterone_total" }))).toEqual([
      { kind: "lab", text: "Lab results: above the cut-off · testosterone_total" },
    ]);
    expect(ruleChecks(rule({ vital: "bmi" }))).toEqual([{ kind: "vital", text: "Examination: BMI" }]);
  });

  it("lists both when a rule carries an answer check and a lab check", () => {
    expect(ruleChecks(rule({ answer_check: "medicine_listed", lab_check: "never_measured" })).map((c) => c.kind)).toEqual([
      "answer", "lab",
    ]);
  });

  it("is empty for a rule the doctor applies by hand", () => {
    expect(ruleChecks(rule({ answer_check: "", lab_check: "", vital: "" }))).toEqual([]);
  });
});

describe("cutoffNotSet", () => {
  it("flags a shown cut-off box that holds no number", () => {
    expect(cutoffNotSet("[set]", null)).toBe(true);
    expect(cutoffNotSet("", null)).toBe(true);
    expect(cutoffNotSet("60", "abc")).toBe(true);
  });

  it("accepts numbers, decimal commas, and rules with no box", () => {
    expect(cutoffNotSet("60", "10")).toBe(false);
    expect(cutoffNotSet("2,5", null)).toBe(false);
    expect(cutoffNotSet(null, null)).toBe(false);
    expect(cutoffNotSet(undefined)).toBe(false);
  });
});

describe("medicine names", () => {
  it("offers the editor for rules that list names or read them", () => {
    expect(usesMedicineTerms(rule({ medicine_terms: ["prometrium"] }))).toBe(true);
    expect(usesMedicineTerms(rule({ answer_check: "medicine_listed", medicine_terms: [] }))).toBe(true);
    expect(usesMedicineTerms(rule({ answer_check: "vte" }))).toBe(false);
  });

  it("adds a trimmed name and refuses blanks, repeats, long names and a 21st name", () => {
    expect(addMedicineTerm(["A"], "  b  ")).toEqual({ terms: ["A", "b"], error: null });
    expect(addMedicineTerm(["A"], "   ").error).toBe("Type a medicine name first.");
    expect(addMedicineTerm(["Prometrium"], "prometrium").error).toBe("That name is already listed.");
    expect(addMedicineTerm([], "x".repeat(MAX_MEDICINE_TERM_LENGTH)).error).toBeNull();
    expect(addMedicineTerm([], "x".repeat(MAX_MEDICINE_TERM_LENGTH + 1)).error).toMatch(/at most 80 characters/);
    const full = Array.from({ length: MAX_MEDICINE_TERMS }, (_, i) => `m${i}`);
    expect(addMedicineTerm(full, "one more")).toEqual({ terms: full, error: "A rule can list at most 20 medicine names." });
  });

  it("compares lists in order", () => {
    expect(sameTerms(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameTerms(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameTerms([], ["a"])).toBe(false);
  });
});

describe("filters", () => {
  const rules = [rule({ code: "R1", answer_check: "vte" }), rule({ code: "R2", level: "amber" }), rule({ code: "R3", level: "reminder", vital: "waist" })];

  it("counts and filters the rules that are not checked automatically", () => {
    expect(filterOptions(rules).find((o) => o.id === "unchecked")?.label).toBe("Not checked automatically (1)");
    expect(rules.filter((r) => matchesFilter(r, "unchecked")).map((r) => r.code)).toEqual(["R2"]);
    expect(rules.filter((r) => matchesFilter(r, "red")).map((r) => r.code)).toEqual(["R1"]);
    expect(rules.filter((r) => matchesFilter(r, "all"))).toHaveLength(3);
  });
});
