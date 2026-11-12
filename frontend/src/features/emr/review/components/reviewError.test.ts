import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/emr/errors";
import { isCaseHold, reviewError } from "./reviewError";

describe("isCaseHold", () => {
  it("is true for the refusals that send the case back to the doctor", () => {
    for (const code of ["values_need_check", "red_alert_open", "alert_rules_not_checked"]) {
      expect(isCaseHold(new ApiError("x", 409, code))).toBe(true);
    }
    expect(isCaseHold(new ApiError("x", 409, "open_slots"))).toBe(false);
    expect(isCaseHold(new Error("x"))).toBe(false);
  });
});

describe("reviewError", () => {
  it("names only actions available on the held case", () => {
    expect(reviewError(new ApiError("x", 409, "values_need_check"), "")).not.toContain("Draft anyway");
    expect(reviewError(new ApiError("x", 409, "red_alert_open"), "")).toContain("Draft anyway");
  });
});
