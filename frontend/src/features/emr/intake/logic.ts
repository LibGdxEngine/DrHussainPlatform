import type {
  AnswerRow,
  AnswerValue,
  Catalogue,
  CatalogueCondition,
  CatalogueField,
  CatalogueQuestion,
  CatalogueSection,
  FormSave,
  MrsPoint,
  PatientForm,
} from "@/lib/api/emr/intake";
import { mrsGroups, mrsHeartThreshold, mrsItems, mrsMax, mrsSexualThreshold } from "./data";
import type { Answers, FormKind, MrsBand, MrsDraft, MrsSummary, ProgressBar, ReviewRow, Step } from "./types";
import { MRS_STEP, REVIEW_STEP } from "./types";

/** The "Not sure" answer a number question with `not_sure` accepts (backend NOT_SURE). */
export const NOT_SURE = "not_sure";

// --- Port of backend intake/catalogue.py: holds, modules_for, placement, visible_questions ----------

/** What the form needs besides the answers to decide which sections open. */
export interface FormContext {
  catalogue: Catalogue;
  kind: FormKind;
  /** The patient's age in whole years, or null when unknown. */
  age: number | null;
  /** Sections staff added on top of the ones her answers open. */
  extra: readonly string[];
}

/** backend `is_blank`: null, "", [] and {} count as unanswered (and undefined, which JSON has no word for). */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// Python's == on JSON scalars, which the backend's `in` uses: True == 1 and False == 0.
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" && typeof b === "number") return Number(a) === b;
  if (typeof a === "number" && typeof b === "boolean") return a === Number(b);
  return a === b;
}

/** Whether a catalogue condition holds for these answers, age and open sections (backend `holds`). */
export function holds(
  condition: CatalogueCondition,
  answers: Answers,
  age: number | null,
  modules: ReadonlySet<string>,
): boolean {
  if ("always" in condition) return Boolean(condition.always);
  if ("all" in condition) return condition.all.every((c) => holds(c, answers, age, modules));
  if ("any" in condition) return condition.any.some((c) => holds(c, answers, age, modules));
  if ("not" in condition) return !holds(condition.not, answers, age, modules);
  if ("module" in condition) return modules.has(condition.module);
  if ("age_gte" in condition) return age !== null && age >= condition.age_gte;
  if ("answered" in condition) return !isBlank(answers[condition.answered]);
  if ("answer" in condition) {
    const value: unknown = answers[condition.answer];
    const wanted = "in" in condition ? condition.in : condition.not_in;
    const values: unknown[] = Array.isArray(value) ? value : [value];
    const found = values.some((v) => v !== null && v !== undefined && wanted.some((w) => sameValue(v, w)));
    return "in" in condition ? found : !found;
  }
  throw new Error(`Unknown catalogue condition: ${JSON.stringify(condition)}`);
}

export const sectionsFor = (catalogue: Catalogue, kind: FormKind) =>
  catalogue.sections.filter((s) => s.kinds.includes(kind));

/** The ids of the sections that open for these answers, the patient's age and the added modules. */
export function modulesFor(ctx: FormContext, answers: Answers): Set<string> {
  const added = new Set(ctx.extra);
  const opened = new Set<string>();
  for (const section of sectionsFor(ctx.catalogue, ctx.kind)) {
    const opens = section.opens_when !== null && holds(section.opens_when, answers, ctx.age, opened);
    if ((section.addable && added.has(section.id)) || opens) opened.add(section.id);
  }
  return opened;
}

/** The open section a question is asked in: its own, else the first open one in `also_in`; or null. */
export function placement(question: CatalogueQuestion, home: string, modules: ReadonlySet<string>): string | null {
  return [home, ...(question.also_in ?? [])].find((id) => modules.has(id)) ?? null;
}

/** Each shown question with the section it is asked in, in catalogue order. */
function placedQuestions(ctx: FormContext, answers: Answers, modules: ReadonlySet<string>) {
  const placed: { question: CatalogueQuestion; section: string }[] = [];
  for (const section of sectionsFor(ctx.catalogue, ctx.kind)) {
    for (const question of section.questions) {
      const where = placement(question, section.id, modules);
      if (where === null) continue;
      if (question.show_if && !holds(question.show_if, answers, ctx.age, modules)) continue;
      placed.push({ question, section: where });
    }
  }
  return placed;
}

/** The ids of the questions shown for these answers (backend `visible_questions`). */
export function visibleQuestions(ctx: FormContext, answers: Answers): Set<string> {
  return new Set(placedQuestions(ctx, answers, modulesFor(ctx, answers)).map((p) => p.question.id));
}

/** A shown question's `required`: true, or a condition that holds now. */
export function isRequired(question: CatalogueQuestion, ctx: FormContext, answers: Answers, modules: ReadonlySet<string>) {
  const { required } = question;
  if (!required || question.type === "mrs") return false;
  return required === true || holds(required, answers, ctx.age, modules);
}

/** Shown, required questions left blank, in catalogue order (backend `missing_required`). */
export function missingRequired(ctx: FormContext, answers: Answers): string[] {
  const modules = modulesFor(ctx, answers);
  return placedQuestions(ctx, answers, modules)
    .filter(({ question }) => isRequired(question, ctx, answers, modules) && isBlank(answers[question.id]))
    .map(({ question }) => question.id);
}

// --- Steps ------------------------------------------------------------------------------------------

const reviewStep: Step = { id: REVIEW_STEP, title: "Check and send", questions: [], sections: [], mrs: false };

/** The catalogue's MRS question (it sits in the full form's menopause section). */
const mrsQuestionOf = (catalogue: Catalogue) =>
  catalogue.sections.flatMap((s) => s.questions).find((q) => q.type === "mrs");

/**
 * The screens of the form, in order, for the current answers: one per open topic that has a question
 * to ask (consecutive sections with the same title share a screen), then check-and-send. A follow-up
 * always asks the MRS, after its own questions.
 */
export function stepsFor(ctx: FormContext, answers: Answers): Step[] {
  const modules = modulesFor(ctx, answers);
  const placed = placedQuestions(ctx, answers, modules);
  const steps: Step[] = [];
  let group: CatalogueSection[] = [];
  const flush = () => {
    if (!group.length) return;
    const ids = new Set(group.map((s) => s.id));
    const questions = placed.filter((p) => ids.has(p.section)).map((p) => p.question);
    if (questions.length) {
      steps.push({
        id: group[0].id,
        title: group[0].title,
        intro: group.find((s) => modules.has(s.id) && s.intro)?.intro,
        questions,
        sections: group,
        mrs: questions.some((q) => q.type === "mrs"),
      });
    }
    group = [];
  };
  for (const section of sectionsFor(ctx.catalogue, ctx.kind)) {
    if (group.length && group[group.length - 1].title !== section.title) flush();
    group.push(section);
  }
  flush();
  if (ctx.kind === "followup") {
    const question = mrsQuestionOf(ctx.catalogue);
    const mrsStep: Step = {
      id: MRS_STEP,
      title: ctx.catalogue.sections.find((s) => question && s.questions.includes(question))?.title ?? "MRS",
      questions: question ? [question] : [],
      sections: [],
      mrs: true,
    };
    steps.splice(Math.min(1, steps.length), 0, mrsStep);
  }
  return [...steps, reviewStep];
}

/** The index of the step that asks a question named in a server error field ("answers.<id>", "<id>", "mrs"). */
export function stepOfField(steps: Step[], field: string): number {
  const key = field.replace(/^answers\./, "").split(".")[0];
  if (key === "mrs") return steps.findIndex((s) => s.mrs);
  return steps.findIndex((s) => s.questions.some((q) => q.id === key));
}

/** The question ids named in server error fields. */
export const questionsOfFields = (fields: string[]) =>
  fields.map((f) => f.replace(/^answers\./, "").split(".")[0]);

// --- Values -----------------------------------------------------------------------------------------

type Spec = CatalogueQuestion | CatalogueField;

/** One answer as it is sent: text trimmed, empty rows and blanks dropped (undefined when nothing is left). */
export function cleanValue(spec: Spec, value: AnswerValue | undefined): AnswerValue | undefined {
  if (isBlank(value)) return undefined;
  if (spec.type === "text" && typeof value === "string") {
    const text = value.trim().slice(0, spec.max_length ?? 500);
    return text || undefined;
  }
  if (spec.type === "multi" && Array.isArray(value)) return [...new Set(value as string[])];
  if (spec.type === "rows" && Array.isArray(value)) {
    const fields = "fields" in spec ? spec.fields ?? [] : [];
    const defaults = new Set(fields.filter((f) => f.default !== undefined).map((f) => f.id));
    const rows = (value as AnswerRow[]).flatMap((row) => {
      const clean: AnswerRow = {};
      for (const field of fields) {
        const item = cleanValue(field, (row[field.id] ?? field.default) as AnswerValue | undefined);
        if (item !== undefined) clean[field.id] = item as AnswerRow[string];
      }
      const keys = Object.keys(clean);
      return keys.length && !keys.every((k) => defaults.has(k)) ? [clean] : [];
    });
    return rows.length ? rows.slice(0, "max_rows" in spec ? spec.max_rows ?? 20 : 20) : undefined;
  }
  return value;
}

const isIsoDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Why a (non-blank) answer would be refused by the backend, or null. */
export function valueProblem(spec: Spec, value: AnswerValue | undefined): string | null {
  if (isBlank(value)) return null;
  const { label } = spec;
  if (spec.type === "number" || spec.type === "scale") {
    if ("not_sure" in spec && spec.not_sure && value === NOT_SURE) return null;
    const low = spec.min ?? null;
    const high = spec.max ?? null;
    if (typeof value !== "number" || !Number.isInteger(value)) return `${label}: enter a whole number.`;
    if ((low !== null && value < low) || (high !== null && value > high)) {
      return `${label}: enter a number from ${low} to ${high}.`;
    }
  }
  if (spec.type === "date" && !isIsoDate(value)) return `${label}: enter a full date.`;
  if (spec.type === "rows" && Array.isArray(value) && "fields" in spec) {
    const rows = cleanValue(spec, value) as AnswerRow[] | undefined;
    for (const row of rows ?? []) {
      for (const field of spec.fields ?? []) {
        if (field.required && isBlank(row[field.id])) return `${label}: each row needs the ${field.label.toLowerCase()}.`;
        const problem = valueProblem(field, row[field.id] as AnswerValue | undefined);
        if (problem) return `${label}: ${problem}`;
      }
    }
  }
  return null;
}

/** Why the patient can't continue from this step yet, with the questions to mark; or null. */
export function stepProblem(
  step: Step,
  ctx: FormContext,
  answers: Answers,
  mrs: MrsDraft,
): { message: string; fields: string[] } | null {
  if (step.mrs) {
    const missing = mrs.filter((v) => v === null).length;
    if (missing) {
      return {
        message: missing === 1 ? "Answer the last symptom question." : `Answer all the symptom questions (${missing} left).`,
        fields: [MRS_STEP],
      };
    }
  }
  const modules = modulesFor(ctx, answers);
  const asked = step.questions.filter((q) => q.type !== "mrs");
  const missing = asked.filter((q) => isRequired(q, ctx, answers, modules) && cleanValue(q, answers[q.id]) === undefined);
  if (missing.length === 1) return { message: `Please answer: ${missing[0].label}`, fields: [missing[0].id] };
  if (missing.length > 1) {
    return { message: `Please answer the ${missing.length} questions marked “Required”.`, fields: missing.map((q) => q.id) };
  }
  for (const question of asked) {
    const problem = valueProblem(question, answers[question.id]);
    if (problem) return { message: problem, fields: [question.id] };
  }
  return null;
}

// --- Payload ----------------------------------------------------------------------------------------

export const emptyMrs = (): MrsDraft => mrsItems.map(() => null);

export function mrsFromSaved(saved: number[] | null | undefined): MrsDraft {
  return mrsItems.map((_, i) => {
    const v = saved?.[i];
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4 ? v : null;
  });
}

export const mrsComplete = (mrs: MrsDraft): mrs is number[] =>
  mrs.length === mrsItems.length && mrs.every((v) => v !== null);

/** Saved answers from the server, as an object (anything else is treated as nothing saved). */
export function answersFromSaved(raw: unknown): Answers {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Answers) } : {};
}

/** The question each form kind uses for the patient's own medicine list, prefilled from the clinic's records. */
const medicineList: Record<FormKind, string> = { full: "current_medicines", followup: "medicines" };

/**
 * Whether the form opens this question filled in (carry-forward answers and the medicine lists;
 * backend `is_prefilled`). Emptied by the patient, it is sent as null: an explicit empty answer
 * that the backend keeps, and the form does not fill in again.
 */
export const isPrefilled = (question: CatalogueQuestion) =>
  question.carry_forward || Object.values(medicineList).includes(question.id);

/**
 * What is sent on save and submit: answers to the questions shown now, cleaned, in catalogue order
 * (hidden ones, e.g. pregnancy once periods have stopped, are left out), and the MRS only when it is
 * asked and all 11 items are scored. A prefilled question she emptied (its key is still in the
 * answers, blank) is sent as null.
 */
export function buildPayload(ctx: FormContext, answers: Answers, mrs: MrsDraft): FormSave {
  const modules = modulesFor(ctx, answers);
  const out: Answers = {};
  for (const { question } of placedQuestions(ctx, answers, modules)) {
    if (question.type === "mrs") continue;
    const value = cleanValue(question, answers[question.id]);
    if (value !== undefined) out[question.id] = value;
    else if (isPrefilled(question) && question.id in answers) out[question.id] = null;
  }
  const payload: FormSave = { answers: out };
  if (stepsFor(ctx, answers).some((s) => s.mrs) && mrsComplete(mrs)) payload.mrs = mrs;
  return payload;
}

/**
 * The answers the form opens with: what she saved, then, for questions she has not answered on this
 * form, her answers from earlier forms (carry-forward questions only) and the medicines on record.
 * A question she saved as emptied (null) stays empty. `carried` lists the questions filled in from
 * earlier forms or the records, for her to confirm or change.
 */
export function initialAnswers(
  form: Pick<PatientForm, "kind" | "answers" | "previous_answers" | "current_medicines" | "catalogue">,
): { answers: Answers; carried: string[] } {
  const answers = answersFromSaved(form.answers);
  const previous = answersFromSaved(form.previous_answers);
  const decided = (id: string) => id in answers;
  const carried: string[] = [];
  for (const section of sectionsFor(form.catalogue, form.kind)) {
    for (const question of section.questions) {
      if (!question.carry_forward || decided(question.id) || isBlank(previous[question.id])) continue;
      answers[question.id] = previous[question.id];
      carried.push(question.id);
    }
  }
  const listId = medicineList[form.kind];
  const list = sectionsFor(form.catalogue, form.kind).flatMap((s) => s.questions).find((q) => q.id === listId);
  const nameField = list?.fields?.find((f) => f.type === "text" && f.required);
  if (list && nameField && !decided(listId) && form.current_medicines.length) {
    answers[listId] = form.current_medicines.slice(0, list.max_rows ?? 20).map((name) => {
      const row: AnswerRow = {};
      for (const field of list.fields ?? []) {
        if (field.default !== undefined) row[field.id] = field.default as AnswerRow[string];
      }
      row[nameField.id] = name;
      return row;
    });
    carried.push(listId);
  }
  return { answers, carried };
}

// --- Reading answers back -----------------------------------------------------------------------------

const optionLabel = (spec: Spec, value: unknown) =>
  spec.options?.find((o) => sameValue(o.value, value))?.label ?? String(value);

/** An answer in the catalogue's words (backend `format_answer`). */
export function formatAnswer(spec: Spec, value: AnswerValue): string {
  if (spec.type === "multi" && Array.isArray(value)) return value.map((v) => optionLabel(spec, v)).join(", ");
  if (spec.type === "tick") return value ? "Yes" : "No";
  if (spec.type === "rows" && Array.isArray(value)) {
    const fields = "fields" in spec ? spec.fields ?? [] : [];
    return (value as AnswerRow[]).map((row) => [
      ...fields.filter((f) => f.type !== "tick" && !isBlank(row[f.id])).map((f) => formatAnswer(f, row[f.id] as AnswerValue)),
      ...fields.filter((f) => f.type === "tick" && row[f.id] === true).map((f) => f.label),
    ].join(", ")).join("; ");
  }
  if (spec.type === "number" && value === NOT_SURE) return "Not sure";
  return optionLabel(spec, value);
}

/** Every answer on the form in the catalogue's words, for the check-and-send screen. */
export function reviewRows(steps: Step[], answers: Answers, mrs: MrsDraft): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const step of steps) {
    if (step.mrs) {
      const answered = mrs.filter((v) => v !== null).length;
      rows.push({
        step: step.id,
        label: step.title,
        value: answered === mrsItems.length ? "All answered" : `${answered} of ${mrsItems.length} answered`,
      });
    }
    for (const question of step.questions) {
      if (question.type === "mrs") continue;
      const value = cleanValue(question, answers[question.id]);
      if (value !== undefined) rows.push({ step: step.id, label: question.label, value: formatAnswer(question, value) });
    }
  }
  return rows;
}

// --- MRS and the rest ---------------------------------------------------------------------------------

function bandFor(total: number): MrsBand {
  if (total >= 16) return { label: "Severe", className: "text-danger-ink" };
  if (total >= 9) return { label: "Moderate", className: "text-warn-ink" };
  if (total >= 5) return { label: "Mild", className: "text-ok-ink" };
  return { label: "None / minimal", className: "text-muted" };
}

export function summarizeMrs(scores: number[]): MrsSummary {
  const sum = (idx: number[]) => idx.reduce((s, i) => s + scores[i], 0);
  const total = scores.reduce((s, v) => s + v, 0);
  return {
    total,
    band: bandFor(total),
    somatic: sum(mrsGroups.somatic),
    psychological: sum(mrsGroups.psychological),
    urogenital: sum(mrsGroups.urogenital),
    heartFlag: scores[1] >= mrsHeartThreshold,
    sexualFlag: scores[7] >= mrsSexualThreshold,
  };
}

export function toggleIn<T>(list: readonly T[] | undefined, id: T): T[] {
  const items = list ?? [];
  return items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
}

/** The link token from a `#t=<token>` fragment, or null. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t")?.trim();
  return token ? token : null;
}

/** "YYYY-MM-DD" for a real calendar date, or null. Month is 1–12. */
export function dateOfBirthIso(day: string, month: string, year: string, today = new Date()): string | null {
  const [d, m, y] = [day, month, year].map((v) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN));
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 1900 || y > today.getFullYear() || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1) return null;
  if (date.getTime() > today.getTime()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Up to the four latest earlier MRS scores, oldest first, as chart bars. */
export function progressBars(points: MrsPoint[], limit = 4): ProgressBar[] {
  return [...points]
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(-limit)
    .map((p) => ({
      label: new Date(p.date).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      value: p.total,
      pct: Math.max(4, Math.min(100, Math.round((p.total / mrsMax) * 100))),
    }));
}

/** One sentence about the change between the first and latest earlier score (lower is better). */
export function progressMessage(points: MrsPoint[]): string | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((x, y) => x.date.localeCompare(y.date));
  const first = sorted[0].total;
  const last = sorted[sorted.length - 1].total;
  if (last < first) return `Your symptom score went down from ${first} to ${last}. Lower is better.`;
  if (last > first) return `Your symptom score went up from ${first} to ${last}. The doctor will go through this with you.`;
  return `Your symptom score has stayed at ${last}.`;
}

/** What the patient is told when the link can't be used. `retry` when trying again may help. */
export function linkProblem(code: string | undefined): { title: string; message: string; retry: boolean } {
  switch (code) {
    case "NO_TOKEN":
      return {
        title: "This link is incomplete",
        message: "Open the link exactly as the clinic sent it to you. If it still does not work, ask the clinic to send it again.",
        retry: false,
      };
    case "LINK_INVALID":
      return {
        title: "This link no longer works",
        message: "It may have expired or been replaced by a newer link. Ask the clinic to send you a new one.",
        retry: false,
      };
    case "LINK_LOCKED":
      return {
        title: "This link is locked",
        message: "The date of birth was entered wrongly too many times. For your safety, ask the clinic to send you a new link.",
        retry: false,
      };
    default:
      return {
        title: "We could not open your form",
        message: "Check your internet connection and try again.",
        retry: true,
      };
  }
}

/** "Tuesday 13 Oct, 09:30" for the visit, or null. */
export function visitText(visitAt: string | null | undefined): string | null {
  if (!visitAt) return null;
  const date = new Date(visitAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}
