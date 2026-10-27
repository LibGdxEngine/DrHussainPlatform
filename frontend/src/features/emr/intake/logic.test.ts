import { describe, expect, it } from "vitest";
import {
  buildPayload,
  dateOfBirthIso,
  emptyMrs,
  linkProblem,
  medicinesFor,
  modulesFor,
  mrsFromSaved,
  progressBars,
  progressMessage,
  reviewRows,
  stepProblem,
  stepsFor,
  summarizeMrs,
  tokenFromHash,
} from "./logic";

const full = (n: number) => Array.from({ length: 11 }, () => n);

describe("stepsFor", () => {
  it("asks the MRS on a full form only for menopause reasons", () => {
    expect(stepsFor("full", { reasons: ["dis"] })).toEqual(["reasons", "periods", "notes", "review"]);
    expect(stepsFor("full", { reasons: ["dis", "hrt"] })).toEqual(["reasons", "periods", "mrs", "notes", "review"]);
    expect(stepsFor("full", {})).toEqual(["reasons", "periods", "notes", "review"]);
  });

  it("always asks the MRS on a follow-up", () => {
    expect(stepsFor("followup", {})).toEqual(["progress", "treatment", "mrs", "notes", "review"]);
  });

  it("modulesFor adds the menopause questions once", () => {
    expect(modulesFor(new Set(["meno", "lib"]))).toHaveLength(1);
    expect(modulesFor(new Set(["routine"]))).toEqual([]);
  });
});

describe("tokenFromHash", () => {
  it("reads t from the fragment", () => {
    expect(tokenFromHash("#t=abc123")).toBe("abc123");
    expect(tokenFromHash("#x=1&t=tok")).toBe("tok");
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#t=")).toBeNull();
  });
});

describe("dateOfBirthIso", () => {
  const today = new Date("2026-10-27T12:00:00Z");
  it("builds an ISO date from day, month and year", () => {
    expect(dateOfBirthIso("4", "3", "1974", today)).toBe("1974-03-04");
  });
  it("rejects impossible or future dates", () => {
    expect(dateOfBirthIso("31", "2", "1980", today)).toBeNull();
    expect(dateOfBirthIso("1", "1", "2030", today)).toBeNull();
    expect(dateOfBirthIso("", "1", "1980", today)).toBeNull();
    expect(dateOfBirthIso("1", "13", "1980", today)).toBeNull();
    expect(dateOfBirthIso("1", "1", "1850", today)).toBeNull();
  });
});

describe("buildPayload", () => {
  it("keeps only the conditional answers that still apply", () => {
    const payload = buildPayload("full", {
      reasons: ["routine"],
      other_reason: "dropped because other is not chosen",
      period_status: "reg",
      pregnant: "no",
      bleed_after_year: "yes",
      menopause_age: 51,
      uterus: "yes",
      last_period: "  Aug 2025 ",
      notes: "   ",
      overall: "better",
    }, emptyMrs());
    expect(payload).toEqual({ answers: { reasons: ["routine"], period_status: "reg", pregnant: "no", last_period: "Aug 2025" } });
  });

  it("keeps stopped-period answers and drops an out-of-range age", () => {
    const payload = buildPayload("full", {
      reasons: ["other"], other_reason: "Hair loss", period_status: "stopped", pregnant: "yes",
      bleed_after_year: "no", menopause_age: 5, uterus: "no",
    }, emptyMrs());
    expect(payload.answers).toEqual({
      reasons: ["other"], other_reason: "Hair loss", period_status: "stopped", bleed_after_year: "no", uterus: "no",
    });
  });

  it("sends the MRS only when it is asked and complete", () => {
    expect(buildPayload("full", { reasons: ["meno"] }, full(2)).mrs).toEqual(full(2));
    expect(buildPayload("full", { reasons: ["dis"] }, full(2)).mrs).toBeUndefined();
    const partial = full(1).map((v, i) => (i === 3 ? null : v));
    expect(buildPayload("followup", {}, partial).mrs).toBeUndefined();
  });

  it("maps follow-up answers and cleans medicines", () => {
    const payload = buildPayload("followup", {
      overall: "same", adherence: "yes", adherence_reason: "ignored", side_effects: [], bleeding: "no",
      medicines: [{ name: " Estradiol ", still_taking: false }, { name: " ", still_taking: true }],
      reasons: ["meno"],
    }, full(0));
    expect(payload).toEqual({
      answers: { overall: "same", adherence: "yes", bleeding: "no", medicines: [{ name: "Estradiol", still_taking: false }] },
      mrs: full(0),
    });
  });
});

describe("stepProblem", () => {
  it("requires a reason, a period answer and every MRS item", () => {
    expect(stepProblem("reasons", {}, emptyMrs())).toMatch(/at least one/);
    expect(stepProblem("reasons", { reasons: ["pain"] }, emptyMrs())).toBeNull();
    expect(stepProblem("periods", {}, emptyMrs())).toMatch(/periods/);
    expect(stepProblem("periods", { period_status: "stopped", menopause_age: 90 }, emptyMrs())).toMatch(/between 20 and 70/);
    expect(stepProblem("periods", { period_status: "stopped", menopause_age: null }, emptyMrs())).toBeNull();
    expect(stepProblem("mrs", {}, emptyMrs())).toMatch(/11 left/);
    expect(stepProblem("mrs", {}, full(4))).toBeNull();
    expect(stepProblem("notes", {}, emptyMrs())).toBeNull();
  });
});

describe("saved data", () => {
  it("restores only valid MRS scores", () => {
    expect(mrsFromSaved([0, 5, 2])).toEqual([0, null, 2, null, null, null, null, null, null, null, null]);
    expect(mrsFromSaved(null)).toEqual(emptyMrs());
  });

  it("prefers saved medicines over the prescription", () => {
    expect(medicinesFor({}, ["Progesterone 100 mg"])).toEqual([{ name: "Progesterone 100 mg", still_taking: true }]);
    expect(medicinesFor({ medicines: [{ name: "A", still_taking: false }] }, ["B"])).toEqual([{ name: "A", still_taking: false }]);
  });
});

describe("reviewRows", () => {
  it("describes the answers in plain words", () => {
    const rows = reviewRows("full", { reasons: ["meno", "other"], other_reason: "Tired", period_status: "irr" }, emptyMrs());
    expect(rows.find((r) => r.label === "Reasons for your visit")?.value).toBe(
      "Menopause symptoms (flushes, sleep, mood), Something else: Tired",
    );
    expect(rows.find((r) => r.label === "Could you be pregnant")?.value).toBe("Not answered");
    expect(rows.find((r) => r.step === "mrs")?.value).toBe("0 of 11 answered");
  });
});

describe("progress", () => {
  const points = [
    { date: "2026-06-01T10:00:00Z", total: 14, somatic: 0, psychological: 0, urogenital: 0 },
    { date: "2026-03-01T10:00:00Z", total: 22, somatic: 0, psychological: 0, urogenital: 0 },
  ];
  it("orders bars oldest first and scales to 44", () => {
    expect(progressBars(points).map((b) => [b.value, b.pct])).toEqual([[22, 50], [14, 32]]);
  });
  it("summarises the change", () => {
    expect(progressMessage(points)).toMatch(/down from 22 to 14/);
    expect(progressMessage(points.slice(0, 1))).toBeNull();
  });
});

describe("linkProblem", () => {
  it("only offers a retry for unknown failures", () => {
    expect(linkProblem("LINK_LOCKED").retry).toBe(false);
    expect(linkProblem("LINK_INVALID").retry).toBe(false);
    expect(linkProblem(undefined).retry).toBe(true);
  });
});

describe("summarizeMrs", () => {
  it("adds up the groups", () => {
    const s = summarizeMrs(full(1));
    expect([s.total, s.somatic, s.psychological, s.urogenital]).toEqual([11, 4, 4, 3]);
  });
});
