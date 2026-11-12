// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { patientFormApi, type Catalogue, type PatientForm } from "@/lib/api/emr/intake";
import catalogueJson from "../catalogue.fixture.json";
import { emptyMrs, stepsFor, type FormContext } from "../logic";
import type { Answers } from "../types";
import { FormFlow } from "./FormFlow";
import { QuestionStep } from "./QuestionStep";

vi.mock("@/lib/api/emr/intake", () => ({ patientFormApi: { save: vi.fn(), submit: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  vi.mocked(patientFormApi.save).mockResolvedValue({} as PatientForm);
});

const catalogue = catalogueJson as unknown as Catalogue;
const question = (id: string) => catalogue.sections.flatMap((s) => s.questions).find((q) => q.id === id)!;
const optionLabel = (id: string, value: unknown) => question(id).options!.find((o) => o.value === value)!.label;
const addable = catalogue.sections.filter((s) => s.addable).map((s) => s.id);

const form = (over: Partial<PatientForm> = {}): PatientForm => ({
  clinic_name: "Clinic", first_name: "Test", kind: "full", status: "in_progress", visit_at: null,
  answers: {}, mrs: null, previous_mrs: [], current_medicines: [], catalogue, previous_answers: {},
  patient_age: 55, extra_modules: [], ...over,
});
const flow = (f: PatientForm, initialStep = 0) => (
  <FormFlow token="tok" session="ses" form={f} initialStep={initialStep} onSent={vi.fn()} onGone={vi.fn()} />
);
const title = () => screen.getByRole("heading", { level: 1 }).textContent;

it("renders every question in the catalogue, by type, with the catalogue's labels", () => {
  // Two answer sets between them show every question: periods stopped vs continuing, and the
  // sexual health detail open vs discussed in person.
  const ctx: FormContext = { catalogue, kind: "full", age: 55, extra: addable };
  const shown = new Set<string>();
  const sets: Answers[] = [
    {
      reasons: ["other"], period_status: "stopped", contraception: "lng_ius", hs_breast_cancer: "yes",
      osteoporosis: "yes", hrt_effect: "side_effects", progestin_reactions: "yes", low_desire: "yes",
      breast_symptoms: ["lump", "discharge", "pain"],
    },
    { reasons: ["routine"], period_status: "reg", discuss_in_person: true },
  ];
  for (const answers of sets) {
    for (const step of stepsFor(ctx, answers)) {
      if (!step.questions.length) continue;
      const { unmount } = render(
        <QuestionStep step={step} ctx={ctx} answers={answers} onChange={vi.fn()} carried={new Set()} onConfirm={vi.fn()}
          marked={new Set()} mrs={emptyMrs()} onMrs={vi.fn()} />,
      );
      for (const q of step.questions) {
        expect(screen.getAllByText(q.label, { exact: false }).length, q.id).toBeGreaterThan(0);
        shown.add(q.id);
      }
      unmount();
    }
  }
  const all = catalogue.sections.filter((s) => s.kinds.includes("full")).flatMap((s) => s.questions.map((q) => q.id));
  expect(all.filter((id) => !shown.has(id))).toEqual([]);
});

it("saves every answer type the patient gives", () => {
  const ctx: FormContext = { catalogue, kind: "full", age: 55, extra: ["pain"] };
  const onChange = vi.fn();
  const answers: Answers = { reasons: ["pain"], period_status: "stopped" };
  const steps = stepsFor(ctx, answers);
  const show = (id: string) => render(
    <QuestionStep step={steps.find((s) => s.id === id)!} ctx={ctx} answers={answers} onChange={onChange}
      carried={new Set()} onConfirm={vi.fn()} marked={new Set()} mrs={emptyMrs()} onMrs={vi.fn()} />,
  );

  show("details");
  fireEvent.click(screen.getByRole("button", { name: new RegExp(optionLabel("reasons", "heavy")) }));
  expect(onChange).toHaveBeenLastCalledWith("reasons", ["pain", "heavy"]);
  cleanup();

  show("periods");
  fireEvent.click(within(screen.getByRole("group", { name: question("bleed_after_year").label })).getByText("Yes"));
  expect(onChange).toHaveBeenLastCalledWith("bleed_after_year", "yes");
  fireEvent.change(screen.getByLabelText(question("menopause_age").label, { exact: false }), { target: { value: "51" } });
  expect(onChange).toHaveBeenLastCalledWith("menopause_age", 51);
  fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
  expect(onChange).toHaveBeenLastCalledWith("menopause_age", "not_sure");
  cleanup();

  show("pain");
  fireEvent.click(within(screen.getByRole("radiogroup", { name: question("pain_score").label })).getByText("7"));
  expect(onChange).toHaveBeenLastCalledWith("pain_score", 7);
  cleanup();

  show("obstetric");
  fireEvent.change(screen.getByLabelText(question("last_smear_date").label), { target: { value: "2024-05-01" } });
  expect(onChange).toHaveBeenLastCalledWith("last_smear_date", "2024-05-01");
  cleanup();

  show("family");
  fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
  expect(onChange).toHaveBeenLastCalledWith("fh_breast_cancer", [{}]);
  cleanup();

  show("sexual");
  fireEvent.click(screen.getByRole("button", { name: question("discuss_in_person").label }));
  expect(onChange).toHaveBeenLastCalledWith("discuss_in_person", true);
});

it("blocks Continue on a blank required question and saves once it is answered", async () => {
  render(flow(form()));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toBe(`Please answer: ${question("reasons").label}`);
  expect(patientFormApi.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(optionLabel("reasons", "routine")) }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(patientFormApi.save).toHaveBeenCalledWith("ses", { answers: { reasons: ["routine"] } }));
  expect(title()).toBe(catalogue.sections.find((s) => s.id === "periods")!.title);
});

it("blocks the periods screen once periods have stopped until the M3 questions are answered", () => {
  render(flow(form({ answers: { reasons: ["routine"] } }), 1));
  fireEvent.click(screen.getByText(optionLabel("period_status", "stopped")));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toMatch(/5 questions/);
  expect(title()).toBe(catalogue.sections.find((s) => s.id === "periods")!.title);
});

it("takes the patient to the step the server says is incomplete", async () => {
  const f = form({ answers: { reasons: ["routine"], period_status: "stopped" } });
  const review = stepsFor({ catalogue, kind: "full", age: 55, extra: [] }, f.answers).length - 1;
  vi.mocked(patientFormApi.submit).mockRejectedValue(new ApiError(
    "Answer the questions marked before sending.", 400, "ANSWERS_INCOMPLETE", { bleed_after_year: ["Answer this question."] },
  ));
  render(flow(f, review));
  fireEvent.click(screen.getByRole("button", { name: "Send to the clinic" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("Answer the questions marked before sending.");
  expect(title()).toBe(catalogue.sections.find((s) => s.id === "periods")!.title);
});

it("shows carried-forward answers for her to confirm", () => {
  const f = form({ answers: { reasons: ["routine"], period_status: "reg" }, previous_answers: { pregnancies: 2 } });
  const obstetric = stepsFor({ catalogue, kind: "full", age: 55, extra: [] }, f.answers).findIndex((s) => s.id === "obstetric");
  render(flow(f, obstetric));
  expect((screen.getByLabelText(question("pregnancies").label, { exact: false }) as HTMLInputElement).value).toBe("2");
  fireEvent.click(screen.getByRole("button", { name: "Yes, still correct" }));
  expect(screen.queryByRole("button", { name: "Yes, still correct" })).toBeNull();
});

it("lets her empty a carried-forward medicine list, and saves it as emptied", async () => {
  render(flow(form({ kind: "followup", current_medicines: ["Estradiol gel"] })));
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(screen.queryByDisplayValue("Estradiol gel")).toBeNull();
  fireEvent.click(screen.getByText(optionLabel("overall", "same")));
  fireEvent.click(within(screen.getByRole("group", { name: question("adherence").label })).getByText(optionLabel("adherence", "yes")));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(patientFormApi.save).toHaveBeenCalledWith("ses", {
    answers: { overall: "same", adherence: "yes", medicines: null },
  }));
});

it("keeps the follow-up form working: medicines on record, then the MRS", async () => {
  render(flow(form({ kind: "followup", current_medicines: ["Estradiol gel"] })));
  expect(screen.getByDisplayValue("Estradiol gel")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toMatch(/2 questions/);
  fireEvent.click(screen.getByText(optionLabel("overall", "same")));
  fireEvent.click(within(screen.getByRole("group", { name: question("adherence").label })).getByText(optionLabel("adherence", "yes")));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(patientFormApi.save).toHaveBeenCalledWith("ses", {
    answers: { overall: "same", adherence: "yes", medicines: [{ name: "Estradiol gel", still_taking: true }] },
  }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toMatch(/11 left/);
});
