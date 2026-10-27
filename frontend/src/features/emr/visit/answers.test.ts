import { describe, expect, it } from "vitest";
import { formStatusText, mrsBand, mrsDomainScores, readAnswers } from "./answers";

describe("readAnswers", () => {
  it("keeps known answers and drops malformed ones", () => {
    const a = readAnswers({
      reasons: ["meno", 3, ""],
      notes: "  Can't sleep  ",
      menopause_age: "51",
      uterus: "yes",
      side_effects: "breast",
      medicines: [{ name: "Estradiol gel", still_taking: false }, { name: "" }, "x", { name: "Progesterone" }],
    });
    expect(a.reasons).toEqual(["meno"]);
    expect(a.notes).toBe("Can't sleep");
    expect(a.menopause_age).toBeUndefined();
    expect(a.uterus).toBe("yes");
    expect(a.side_effects).toEqual([]);
    expect(a.medicines).toEqual([
      { name: "Estradiol gel", still_taking: false },
      { name: "Progesterone", still_taking: true },
    ]);
  });

  it("treats missing or non-object answers as empty", () => {
    expect(readAnswers(null)).toMatchObject({ reasons: [], side_effects: [], medicines: [] });
    expect(readAnswers([1, 2]).reasons).toEqual([]);
  });
});

describe("MRS", () => {
  it("sums the domains from the 11 item scores", () => {
    expect(mrsDomainScores([3, 1, 3, 2, 2, 1, 2, 2, 0, 1, 1])).toEqual({ somatic: 8, psychological: 7, urogenital: 3 });
    expect(mrsDomainScores(null)).toBeNull();
  });

  it("bands totals like the patient form and domains by their own thresholds", () => {
    expect(mrsBand("total", 16).label).toBe("Severe");
    expect(mrsBand("total", 9).label).toBe("Moderate");
    expect(mrsBand("total", 4).label).toBe("None");
    expect(mrsBand("psychological", 7).label).toBe("Severe");
    expect(mrsBand("urogenital", 1).label).toBe("Mild");
  });
});

describe("formStatusText", () => {
  it("describes where the form stands", () => {
    expect(formStatusText(undefined)).toBe("Not sent");
    const base = { sent_at: null, sent_via: "email", opened_at: null, submitted_at: null } as const;
    expect(formStatusText({ ...base, status: "not_started" } as never)).toBe("Created, not sent yet");
    expect(formStatusText({ ...base, status: "not_started", sent_at: "2026-10-03T08:00:00Z" } as never))
      .toBe("Emailed 3 Oct 2026, not started");
    expect(formStatusText({ ...base, status: "complete", submitted_at: "2026-10-12T08:00:00Z" } as never))
      .toBe("Completed 12 Oct 2026");
  });
});
