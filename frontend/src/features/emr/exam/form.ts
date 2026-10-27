import type { Examination, ExaminationFields } from "@/lib/api/emr/examinations";
import type { PlanId } from "./data";
import { parseBp } from "./vitals";

/** The exam screen's form: what the doctor types, as text, before it is turned into API fields. */
export interface ExamForm {
  examined_on: string;
  bp1: string;
  bp2: string;
  height: string;
  weight: string;
  waist: string;
  breast_exam: string;
  pelvic_exam: string;
  screening: Record<string, boolean>;
  plan: PlanId | "";
  plan_notes: string;
  next_review: string;
  send_follow_up_form: boolean;
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const bp = (systolic?: number | null, diastolic?: number | null) => (systolic && diastolic ? `${systolic}/${diastolic}` : "");
// The API sends decimals as "162.0"; show them as the doctor typed them.
const decimal = (value?: string | null) => (value ? String(Number(value)) : "");

/** A blank examination for today. Height rarely changes, so it starts from the latest one. */
export function newForm(latest?: Examination): ExamForm {
  return {
    examined_on: today(), bp1: "", bp2: "", height: decimal(latest?.height_cm), weight: "", waist: "",
    breast_exam: "", pelvic_exam: "", screening: {}, plan: "", plan_notes: "", next_review: "",
    send_follow_up_form: false,
  };
}

export function formFrom(exam: Examination): ExamForm {
  return {
    examined_on: exam.examined_on ?? today(),
    bp1: bp(exam.bp1_systolic, exam.bp1_diastolic),
    bp2: bp(exam.bp2_systolic, exam.bp2_diastolic),
    height: decimal(exam.height_cm), weight: decimal(exam.weight_kg), waist: decimal(exam.waist_cm),
    breast_exam: exam.breast_exam ?? "", pelvic_exam: exam.pelvic_exam ?? "",
    screening: { ...(exam.screening ?? {}) },
    plan: exam.plan ?? "", plan_notes: exam.plan_notes ?? "", next_review: exam.next_review ?? "",
    send_follow_up_form: exam.send_follow_up_form ?? false,
  };
}

/** API fields from the form, or the first problem the doctor must fix. */
export function toFields(form: ExamForm): { fields: ExaminationFields } | { problem: string } {
  const readings = [form.bp1, form.bp2].map((text) => (text.trim() ? parseBp(text) : null));
  if ([form.bp1, form.bp2].some((text, i) => text.trim() && !readings[i])) {
    return { problem: "Write blood pressure as two numbers, e.g. 120/80." };
  }
  const amount = (text: string) => (text.trim() ? text.trim().replace(",", ".") : null);
  return {
    fields: {
      examined_on: form.examined_on || today(),
      bp1_systolic: readings[0]?.[0] ?? null, bp1_diastolic: readings[0]?.[1] ?? null,
      bp2_systolic: readings[1]?.[0] ?? null, bp2_diastolic: readings[1]?.[1] ?? null,
      height_cm: amount(form.height), weight_kg: amount(form.weight), waist_cm: amount(form.waist),
      breast_exam: form.breast_exam.trim(), pelvic_exam: form.pelvic_exam.trim(), screening: form.screening,
      plan: form.plan, plan_notes: form.plan_notes.trim(), next_review: form.next_review || null,
      send_follow_up_form: form.send_follow_up_form,
    },
  };
}
