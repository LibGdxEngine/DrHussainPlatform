import { describe, expect, it } from "vitest";
import type { IntakeFormDetail } from "@/lib/api/emr/intake";
import { rulesNotChecked } from "./rules";

const form = (over: Partial<IntakeFormDetail>) =>
  ({ catalogue_version: "1", rules_evaluated_at: "2026-11-10T10:00:00Z", rule_errors: [], ...over }) as IntakeFormDetail;

describe("rulesNotChecked", () => {
  it("is quiet once an error-free run has stamped the form", () => {
    expect(rulesNotChecked(form({}))).toBeNull();
    expect(rulesNotChecked(undefined)).toBeNull();
  });

  it("says when the rules have not run on a catalogue form", () => {
    expect(rulesNotChecked(form({ rules_evaluated_at: null }))).toMatch(/not been checked/);
  });

  it("names the rules that errored, or all of them", () => {
    expect(rulesNotChecked(form({ rule_errors: [{ rule: "R7", error: "KeyError" }, { rule: "R19", error: "x" }] })))
      .toMatch(/R7, R19\.$/);
    expect(rulesNotChecked(form({ rules_evaluated_at: null, rule_errors: [{ rule: "all", error: "x" }] })))
      .toMatch(/could not be checked/);
  });

  it("does not expect a run on a form sent before the catalogue, but still shows its errors", () => {
    expect(rulesNotChecked(form({ catalogue_version: "", rules_evaluated_at: null }))).toBeNull();
    expect(rulesNotChecked(form({ catalogue_version: "", rule_errors: [{ rule: "R1", error: "x" }] }))).toMatch(/R1/);
  });
});
