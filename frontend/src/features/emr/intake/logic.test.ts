import { describe, expect, it } from "vitest";
import type { Catalogue, PatientForm } from "@/lib/api/emr/intake";
// catalogue.fixture.json is backend intake/catalogue.py's {version, sections}, exactly as the public form
// endpoint serves it. Regenerate after a catalogue change (repo root):
//   python -I -c "import runpy,json,sys; ns=runpy.run_path(sys.argv[1]); print(json.dumps({'version': ns['CATALOGUE_VERSION'], 'sections': ns['SECTIONS']}, indent=1, ensure_ascii=True))" backend/product/intake/catalogue.py > frontend/src/features/emr/intake/catalogue.fixture.json
import catalogueJson from "./catalogue.fixture.json";
// The backend's shared module-opening cases, copied byte for byte (scripts/check-shared-fixtures.sh).
import moduleCases from "./moduleCases.json";
import { extraModuleLabels } from "./data";
import {
  buildPayload,
  dateOfBirthIso,
  emptyMrs,
  formatAnswer,
  holds,
  initialAnswers,
  linkProblem,
  missingRequired,
  modulesFor,
  mrsFromSaved,
  progressBars,
  progressMessage,
  reviewRows,
  stepOfField,
  stepProblem,
  stepsFor,
  summarizeMrs,
  tokenFromHash,
  visibleQuestions,
  type FormContext,
} from "./logic";
import type { Answers, FormKind } from "./types";

const catalogue = catalogueJson as unknown as Catalogue;
const full = (n: number) => Array.from({ length: 11 }, () => n);
const ctx = (over: Partial<FormContext> = {}): FormContext => ({ catalogue, kind: "full", age: 45, extra: [], ...over });
const question = (id: string) => catalogue.sections.flatMap((s) => s.questions).find((q) => q.id === id)!;
const stepOf = (c: FormContext, answers: Answers, id: string) => stepsFor(c, answers).find((s) => s.id === id)!;

describe("module-opening cases shared with the backend", () => {
  for (const c of moduleCases.cases) {
    it(c.name, () => {
      const context = ctx({ kind: c.kind as FormKind, age: c.age, extra: c.extra_modules });
      const answers = c.answers as Answers;
      const expected = c.modules.flatMap((m) => (m === "core" ? moduleCases.core : [m]));
      expect([...modulesFor(context, answers)].sort()).toEqual([...expected].sort());
      const shown = visibleQuestions(context, answers);
      for (const id of c.shown) expect(shown.has(id), `${id} shown`).toBe(true);
      for (const id of c.hidden) expect(shown.has(id), `${id} hidden`).toBe(false);
    });
  }
});

describe("extraModuleLabels", () => {
  it("names every addable section by its catalogue title", () => {
    const addable = Object.fromEntries(catalogue.sections.filter((s) => s.addable).map((s) => [s.id, s.title]));
    expect(extraModuleLabels).toEqual(addable);
  });
});

describe("holds", () => {
  const none = new Set<string>();
  it("treats an unanswered question as not in the values", () => {
    expect(holds({ answer: "x", in: ["yes"] }, {}, null, none)).toBe(false);
    expect(holds({ answer: "x", not_in: ["yes"] }, {}, null, none)).toBe(true);
  });
  it("matches any element of a list answer", () => {
    expect(holds({ answer: "r", in: ["b"] }, { r: ["a", "b"] }, null, none)).toBe(true);
    expect(holds({ answer: "r", not_in: ["b"] }, { r: ["a", "b"] }, null, none)).toBe(false);
  });
  it("compares like the backend: true equals 1, an unknown age never passes", () => {
    expect(holds({ answer: "t", in: [1] }, { t: true }, null, none)).toBe(true);
    expect(holds({ age_gte: 40 }, {}, null, none)).toBe(false);
    expect(holds({ all: [{ age_gte: 40 }, { not: { module: "m" } }] }, {}, 41, none)).toBe(true);
  });
});

describe("stepsFor", () => {
  it("builds one screen per open topic from the catalogue, then check-and-send", () => {
    const ids = stepsFor(ctx(), { reasons: ["dis"], period_status: "reg" }).map((s) => s.id);
    expect(ids).toEqual([
      "details", "periods", "obstetric", "other_history", "mood", "medicines", "family", "lifestyle", "sexual",
      "dis", "notes", "review",
    ]);
  });

  it("asks the MRS on its own screen when the menopause module opens", () => {
    const steps = stepsFor(ctx(), { reasons: ["meno"] });
    expect(steps.filter((s) => s.mrs).map((s) => s.id)).toEqual(["menopause"]);
    expect(steps.map((s) => s.id)).toContain("hormone_screen");
  });

  it("keeps the sexual health opener and its detail on one screen, and moves the UTI question when hidden", () => {
    const open = stepOf(ctx(), { reasons: ["uri"] }, "sexual").questions.map((q) => q.id);
    expect(open).toEqual(expect.arrayContaining(["discuss_in_person", "low_desire", "utis_last_year"]));
    const steps = stepsFor(ctx(), { reasons: ["uri"], discuss_in_person: true });
    expect(steps.find((s) => s.id === "sexual")!.questions.map((q) => q.id)).toEqual(["discuss_in_person"]);
    expect(steps.find((s) => s.id === "uri")!.questions.map((q) => q.id)).toContain("utis_last_year");
  });

  it("takes every title and question label from the catalogue", () => {
    const step = stepOf(ctx(), {}, "periods");
    expect(step.title).toBe(catalogue.sections.find((s) => s.id === "periods")!.title);
    expect(step.questions[0].label).toBe(question("last_period").label);
  });

  it("asks a follow-up its questions, the MRS, then anything else", () => {
    const steps = stepsFor(ctx({ kind: "followup" }), {});
    expect(steps.map((s) => s.id)).toEqual(["followup", "mrs", "notes", "review"]);
    expect(steps[1].mrs).toBe(true);
  });
});

describe("required questions", () => {
  const stopped: Answers = { reasons: ["routine"], period_status: "stopped" };

  it("blocks the periods screen when periods have stopped and the M3 answers are missing", () => {
    const c = ctx({ age: 55 });
    const step = stepOf(c, stopped, "periods");
    const problem = stepProblem(step, c, stopped, emptyMrs());
    expect(problem?.fields.sort()).toEqual(["bleed_after_year", "how_periods_stopped", "menopause_age", "ovaries", "uterus"]);
    expect(problem?.message).toMatch(/5 questions/);
  });

  it("blocks Continue on the periods screen until “Periods now” is answered", () => {
    const c = ctx({ age: 55 });
    const answers: Answers = { reasons: ["routine"] };
    expect(stepProblem(stepOf(c, answers, "periods"), c, answers, emptyMrs())?.fields).toEqual(["period_status"]);
  });

  it("requires the follow-up form's overall and adherence answers", () => {
    const c = ctx({ kind: "followup" });
    const step = stepOf(c, {}, "followup");
    expect(stepProblem(step, c, {}, emptyMrs())?.fields).toEqual(["overall", "adherence"]);
    expect(stepProblem(step, c, { overall: "same", adherence: "yes" }, emptyMrs())).toBeNull();
  });

  it("names the one missing question", () => {
    const c = ctx({ age: 55 });
    const answers: Answers = { ...stopped, menopause_age: 51, how_periods_stopped: "natural", uterus: "yes", ovaries: "both" };
    const problem = stepProblem(stepOf(c, answers, "periods"), c, answers, emptyMrs());
    expect(problem).toEqual({ message: `Please answer: ${question("bleed_after_year").label}`, fields: ["bleed_after_year"] });
  });

  it("accepts “not sure” for the age at menopause", () => {
    const c = ctx({ age: 55 });
    const answers: Answers = {
      ...stopped, bleed_after_year: "no", menopause_age: "not_sure", how_periods_stopped: "natural", uterus: "yes", ovaries: "both",
    };
    expect(stepProblem(stepOf(c, answers, "periods"), c, answers, emptyMrs())).toBeNull();
  });

  it("leaves the M3 questions out while periods continue", () => {
    const c = ctx({ age: 30 });
    const answers: Answers = { reasons: ["routine"], period_status: "reg" };
    expect(stepProblem(stepOf(c, answers, "periods"), c, answers, emptyMrs())).toBeNull();
  });

  it("checks numbers against the catalogue's range", () => {
    const c = ctx({ age: 55 });
    const answers: Answers = {
      ...stopped, bleed_after_year: "no", menopause_age: 90, how_periods_stopped: "natural", uterus: "yes", ovaries: "both",
    };
    expect(stepProblem(stepOf(c, answers, "periods"), c, answers, emptyMrs())?.message).toMatch(/from 20 to 70/);
  });

  it("requires every Part A question once the hormone screen opens, with “prefer to discuss” accepted", () => {
    const c = ctx();
    const answers: Answers = { reasons: ["meno"] };
    const step = stepOf(c, answers, "hormone_screen");
    expect(stepProblem(step, c, answers, emptyMrs())?.fields).toEqual([
      "hs_breast_cancer", "hs_coronary", "hs_stroke", "hs_vte", "hs_unexplained_bleeding", "hs_liver", "hs_cancer_treatment",
    ]);
    const partA = Object.fromEntries(step.questions.filter((q) => q.required === true).map((q) => [q.id, "discuss"]));
    expect(stepProblem(step, c, { ...answers, ...partA }, emptyMrs())).toBeNull();
  });

  it("requires the mood items, including self-harm, where “prefer not to say” counts as an answer", () => {
    const c = ctx();
    const answers: Answers = { reasons: ["routine"], phq2_interest: 0, phq2_down: 1, gad2_nervous: 0, gad2_worry: 3 };
    const step = stepOf(c, answers, "mood");
    expect(stepProblem(step, c, answers, emptyMrs())?.fields).toEqual(["self_harm"]);
    expect(stepProblem(step, c, { ...answers, self_harm: "prefer_not" }, emptyMrs())).toBeNull();
    expect(stepProblem(step, c, { ...answers, self_harm: 0 }, emptyMrs())).toBeNull();
  });

  it("requires a reason and every MRS item", () => {
    const c = ctx();
    expect(stepProblem(stepOf(c, {}, "details"), c, {}, emptyMrs())?.fields).toEqual(["reasons"]);
    expect(stepProblem(stepOf(c, { reasons: ["pain"] }, "details"), c, { reasons: ["pain"] }, emptyMrs())).toBeNull();
    const mrsStep = stepOf(c, { reasons: ["meno"] }, "menopause");
    expect(stepProblem(mrsStep, c, { reasons: ["meno"] }, emptyMrs())?.message).toMatch(/11 left/);
    expect(stepProblem(mrsStep, c, { reasons: ["meno"] }, full(4))).toBeNull();
    expect(stepProblem(stepOf(c, {}, "notes"), c, {}, emptyMrs())).toBeNull();
  });

  it("needs the name on each medicine row", () => {
    const c = ctx();
    const answers: Answers = { current_medicines: [{ name: "", dose: "1 mg" }] };
    expect(stepProblem(stepOf(c, answers, "medicines"), c, answers, emptyMrs())?.fields).toEqual(["current_medicines"]);
  });

  it("agrees with the backend's list of blank required questions", () => {
    const c = ctx({ age: 55 });
    expect(missingRequired(c, { ...stopped, period_status: undefined })).toContain("period_status");
    expect(missingRequired(c, stopped)).toEqual([
      "bleed_after_year", "menopause_age", "how_periods_stopped", "uterus", "ovaries", "hs_breast_cancer", "hs_coronary",
      "hs_stroke", "hs_vte", "hs_unexplained_bleeding", "hs_liver", "hs_cancer_treatment", "phq2_interest", "phq2_down",
      "gad2_nervous", "gad2_worry", "self_harm",
    ]);
  });
});

describe("stepOfField", () => {
  it("finds the screen for a server error field", () => {
    const steps = stepsFor(ctx({ age: 55 }), { reasons: ["routine"], period_status: "stopped" });
    expect(steps[stepOfField(steps, "bleed_after_year")].id).toBe("periods");
    expect(steps[stepOfField(steps, "answers.self_harm")].id).toBe("mood");
    expect(steps[stepOfField(steps, "answers.current_medicines.0.name")].id).toBe("medicines");
    expect(steps[stepOfField(steps, "mrs")].id).toBe("menopause");
    expect(stepOfField(steps, "unknown")).toBe(-1);
  });
});

describe("buildPayload", () => {
  it("keeps only the answers to questions shown now, cleaned", () => {
    const payload = buildPayload(ctx({ age: 30 }), {
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
      unknown_question: "dropped",
    }, emptyMrs());
    expect(payload).toEqual({
      answers: { reasons: ["routine"], last_period: "Aug 2025", period_status: "reg", bleed_after_year: "yes", uterus: "yes", pregnant: "no" },
    });
  });

  it("drops the pregnancy answer once periods have stopped", () => {
    const payload = buildPayload(ctx({ age: 35 }), {
      reasons: ["other"], other_reason: "Hair loss", period_status: "stopped", pregnant: "yes", menopause_age: "not_sure",
    }, emptyMrs());
    expect(payload.answers).toEqual({ reasons: ["other"], other_reason: "Hair loss", period_status: "stopped", menopause_age: "not_sure" });
  });

  it("sends the MRS only when it is asked and complete", () => {
    expect(buildPayload(ctx(), { reasons: ["meno"] }, full(2)).mrs).toEqual(full(2));
    expect(buildPayload(ctx({ age: 30 }), { reasons: ["dis"] }, full(2)).mrs).toBeUndefined();
    const partial = full(1).map((v, i) => (i === 3 ? null : v));
    expect(buildPayload(ctx({ kind: "followup" }), {}, partial).mrs).toBeUndefined();
  });

  it("maps follow-up answers and cleans medicine rows", () => {
    const payload = buildPayload(ctx({ kind: "followup" }), {
      overall: "same", adherence: "yes", adherence_reason: "ignored", side_effects: [], bleeding: "no",
      medicines: [{ name: " Estradiol ", still_taking: false }, { name: " ", still_taking: true }],
      reasons: ["meno"],
    }, full(0));
    expect(payload).toEqual({
      answers: { overall: "same", adherence: "yes", bleeding: "no", medicines: [{ name: "Estradiol", still_taking: false }] },
      mrs: full(0),
    });
  });

  it("keeps relatives rows and drops the empty ones", () => {
    const payload = buildPayload(ctx(), {
      fh_breast_cancer: [{ relative: "mother", age: 44 }, { relative: null, age: null }],
    }, emptyMrs());
    expect(payload.answers?.fh_breast_cancer).toEqual([{ relative: "mother", age: 44 }]);
  });
});

describe("initialAnswers", () => {
  const form = (over: Partial<PatientForm>) => ({
    kind: "full" as const, answers: {}, previous_answers: {}, current_medicines: [], catalogue, ...over,
  });

  it("fills unanswered carry-forward questions from earlier forms and lists them to confirm", () => {
    const { answers, carried } = initialAnswers(form({
      answers: { smoking: "never" },
      previous_answers: { smoking: "current", fh_vte: [{ relative: "mother" }], self_harm: 0 },
    }));
    expect(answers.smoking).toBe("never");
    expect(answers.fh_vte).toEqual([{ relative: "mother" }]);
    expect(answers.self_harm).toBeUndefined();
    expect(carried).toEqual(["fh_vte"]);
  });

  it("prefills the medicine list from the clinic's records", () => {
    expect(initialAnswers(form({ current_medicines: ["Progesterone 100 mg"] })).answers.current_medicines)
      .toEqual([{ name: "Progesterone 100 mg" }]);
    const followup = initialAnswers(form({ kind: "followup", current_medicines: ["Progesterone 100 mg"] }));
    expect(followup.answers.medicines).toEqual([{ name: "Progesterone 100 mg", still_taking: true }]);
    expect(followup.carried).toEqual(["medicines"]);
    const saved = initialAnswers(form({ kind: "followup", answers: { medicines: [{ name: "A", still_taking: false }] }, current_medicines: ["B"] }));
    expect(saved.answers.medicines).toEqual([{ name: "A", still_taking: false }]);
  });

  it("keeps a list she saved as emptied empty instead of filling it in again", () => {
    const { answers, carried } = initialAnswers(form({
      answers: { fh_vte: null, current_medicines: null },
      previous_answers: { fh_vte: [{ relative: "mother" }], smoking: "current" },
      current_medicines: ["Progesterone 100 mg"],
    }));
    expect(answers.fh_vte).toBeNull();
    expect(answers.current_medicines).toBeNull();
    expect(carried).toEqual(["smoking"]);
  });
});

describe("emptying a carried-forward answer", () => {
  it("sends an emptied prefilled question as null, and leaves other blanks out", () => {
    const payload = buildPayload(ctx({ age: 30 }), {
      reasons: ["routine"], period_status: "reg", fh_vte: [], current_medicines: [], gynae_conditions: [],
      alcohol_units: null, bothering_most: "",
    }, emptyMrs());
    expect(payload.answers).toEqual({
      reasons: ["routine"], period_status: "reg", gynae_conditions: null, current_medicines: null,
      alcohol_units: null, fh_vte: null,
    });
    const followup = buildPayload(ctx({ kind: "followup" }), { medicines: [] }, emptyMrs());
    expect(followup.answers).toEqual({ medicines: null });
  });

  it("round-trips: what was sent opens empty again", () => {
    const sent = buildPayload(ctx({ age: 30 }), { reasons: ["routine"], period_status: "reg", fh_vte: [] }, emptyMrs());
    const reopened = initialAnswers({
      kind: "full", answers: sent.answers ?? {}, previous_answers: { fh_vte: [{ relative: "mother" }] },
      current_medicines: [], catalogue,
    });
    expect(reopened.answers.fh_vte).toBeNull();
    expect(reopened.carried).toEqual([]);
  });
});

describe("reviewRows and formatAnswer", () => {
  it("describes the answers in the catalogue's words", () => {
    const c = ctx({ age: 30 });
    const answers: Answers = { reasons: ["meno", "other"], other_reason: "Tired", period_status: "irr" };
    const rows = reviewRows(stepsFor(c, answers), answers, emptyMrs());
    const reasons = question("reasons");
    expect(rows.find((r) => r.label === reasons.label)?.value).toBe(
      ["meno", "other"].map((v) => reasons.options!.find((o) => o.value === v)!.label).join(", "),
    );
    expect(rows.find((r) => r.step === "menopause")?.value).toBe("0 of 11 answered");
    expect(rows.some((r) => r.label === question("pregnant").label)).toBe(false);
  });

  it("formats rows, ticks and not sure", () => {
    expect(formatAnswer(question("fh_breast_cancer"), [{ relative: "mother", age: 44 }])).toBe("Mother, 44");
    expect(formatAnswer(question("medicines"), [{ name: "A", still_taking: true }])).toBe("A, Still taking");
    expect(formatAnswer(question("discuss_in_person"), true)).toBe("Yes");
    expect(formatAnswer(question("menopause_age"), "not_sure")).toBe("Not sure");
    expect(formatAnswer(question("self_harm"), 0)).toBe(question("self_harm").options![0].label);
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

describe("saved data", () => {
  it("restores only valid MRS scores", () => {
    expect(mrsFromSaved([0, 5, 2])).toEqual([0, null, 2, null, null, null, null, null, null, null, null]);
    expect(mrsFromSaved(null)).toEqual(emptyMrs());
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
