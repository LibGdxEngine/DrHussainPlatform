"use client";

import { useMemo, useRef, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { patientFormApi, type AnswerValue, type PatientForm } from "@/lib/api/emr/intake";
import {
  buildPayload,
  initialAnswers,
  isPrefilled,
  mrsFromSaved,
  questionsOfFields,
  reviewRows,
  stepOfField,
  stepProblem,
  stepsFor,
  type FormContext,
} from "../logic";
import { storeStep } from "../storage";
import { REVIEW_STEP, type Answers, type MrsDraft } from "../types";
import { ProgressChart } from "./ProgressStep";
import { QuestionStep } from "./QuestionStep";
import { ReviewStep } from "./ReviewStep";
import { Notice, ScreenBody, ScreenFooter, ScreenHeader } from "./Screen";

/** Answers not yet saved, kept when the session ends so the patient does not lose them. */
export interface Draft {
  answers: Answers;
  mrs: MrsDraft;
  /** Answers filled in from earlier forms that she has not confirmed or changed yet. */
  carried: string[];
}

interface FormFlowProps {
  token: string;
  session: string;
  form: PatientForm;
  initialStep: number;
  draft?: Draft;
  onSent: (alreadySent: boolean) => void;
  /** The session or link stopped working (HTTP 410). */
  onGone: (error: ApiError, draft: Draft) => void;
}

function initialDraft(form: PatientForm): Draft {
  const { answers, carried } = initialAnswers(form);
  return { answers, mrs: mrsFromSaved(form.mrs), carried };
}

const without = (set: ReadonlySet<string>, id: string) => {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
};

/** The questions, one topic per screen, after the date of birth was confirmed. */
export function FormFlow({ token, session, form, initialStep, draft, onSent, onGone }: FormFlowProps) {
  const [start] = useState(() => draft ?? initialDraft(form));
  const [answers, setAnswers] = useState<Answers>(start.answers);
  const [mrs, setMrs] = useState<MrsDraft>(start.mrs);
  const [carried, setCarried] = useState<ReadonlySet<string>>(() => new Set(start.carried));
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  const [index, setIndex] = useState(initialStep);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  // Background saves run one after another so an older one never lands last.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const ctx: FormContext = useMemo(
    () => ({ catalogue: form.catalogue, kind: form.kind, age: form.patient_age, extra: form.extra_modules }),
    [form],
  );
  // Questions the form opens filled in: emptied, they stay in the answers as null so the emptiness is saved.
  const prefilled = useMemo(
    () => new Set(form.catalogue.sections.flatMap((s) => s.questions).filter(isPrefilled).map((q) => q.id)),
    [form],
  );
  const steps = stepsFor(ctx, answers);
  const current = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[current];
  const draftNow = (): Draft => ({ answers, mrs, carried: [...carried] });

  const go = (next: number) => {
    setIndex(next);
    setProblem(null);
    setSaved(null);
    setMarked(new Set());
    storeStep(token, next);
    window.scrollTo({ top: 0 });
  };

  /** Send her to the screen of the first question the server refused, with those questions marked. */
  const showRefused = (err: ApiError): boolean => {
    const fields = Object.keys(err.fields);
    const targets = fields.map((f) => stepOfField(steps, f)).filter((i) => i >= 0);
    if (!targets.length) return false;
    go(Math.min(...targets));
    setMarked(new Set(questionsOfFields(fields)));
    setProblem(err.message);
    return true;
  };

  const failed = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 410) {
      onGone(err, draftNow());
      return;
    }
    if (err instanceof ApiError && err.status === 400 && showRefused(err)) return;
    setProblem(apiErrorMessage(err, fallback));
  };

  const change = (questionId: string, value: AnswerValue | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value !== undefined) next[questionId] = value;
      else if (prefilled.has(questionId)) next[questionId] = null;
      else delete next[questionId];
      return next;
    });
    setCarried((prev) => without(prev, questionId));
    setMarked((prev) => without(prev, questionId));
    setProblem(null);
    setSaved(null);
  };

  const changeMrs = (next: MrsDraft) => {
    setMrs(next);
    setProblem(null);
    setSaved(null);
  };

  const goTo = (stepId: string) => go(Math.max(0, steps.findIndex((s) => s.id === stepId)));

  function next() {
    const why = stepProblem(step, ctx, answers, mrs);
    if (why) {
      setProblem(why.message);
      setMarked(new Set(why.fields));
      return;
    }
    go(current + 1);
    // Keep progress on the server as the patient goes; a failure here only matters if the link is gone.
    const payload = buildPayload(ctx, answers, mrs);
    const unsaved = draftNow();
    saving.current = saving.current
      .then(() => patientFormApi.save(session, payload))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 410) onGone(err, unsaved);
      });
  }

  async function saveForLater() {
    setBusy("save");
    setProblem(null);
    try {
      await saving.current;
      await patientFormApi.save(session, buildPayload(ctx, answers, mrs));
      setSaved("Saved. You can close this page and open the same link later to finish.");
    } catch (err) {
      failed(err, "We could not save your answers. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setProblem(null);
    try {
      await saving.current;
      await patientFormApi.submit(session, buildPayload(ctx, answers, mrs));
      onSent(false);
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiError && err.code === "FORM_COMPLETE") {
        onSent(true);
      } else {
        failed(err, "We could not send your form. Check your connection and try again.");
      }
    }
  }

  const isReview = step.id === REVIEW_STEP;

  return (
    <>
      <ScreenHeader clinic={form.clinic_name} step={{ title: step.title, index: current, total: steps.length }}>
        <button
          type="button"
          onClick={saveForLater}
          disabled={busy !== null}
          className="min-h-11 cursor-pointer self-start text-[13px] font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "save" ? "Saving…" : "Save and finish later"}
        </button>
      </ScreenHeader>
      <ScreenBody>
        {isReview ? (
          <ReviewStep rows={reviewRows(steps, answers, mrs)} onEdit={goTo} />
        ) : (
          <QuestionStep
            key={step.id}
            step={step}
            ctx={ctx}
            answers={answers}
            onChange={change}
            carried={carried}
            onConfirm={(id) => setCarried((prev) => without(prev, id))}
            marked={marked}
            mrs={mrs}
            onMrs={changeMrs}
            before={form.kind === "followup" && current === 0 ? <ProgressChart points={form.previous_mrs} /> : null}
          />
        )}
      </ScreenBody>
      <ScreenFooter
        onBack={current > 0 ? () => go(current - 1) : undefined}
        primary={isReview
          ? { label: busy === "send" ? "Sending…" : "Send to the clinic", onClick: send, busy: busy !== null }
          : { label: "Continue", onClick: next, busy: busy !== null }}
      >
        {problem ? <Notice>{problem}</Notice> : null}
        {saved ? <Notice tone="ok">{saved}</Notice> : null}
      </ScreenFooter>
    </>
  );
}
