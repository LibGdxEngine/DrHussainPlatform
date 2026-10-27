"use client";

import { useRef, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { patientFormApi, type PatientForm } from "@/lib/api/emr/intake";
import { stepTitles } from "../data";
import {
  answersFromSaved,
  buildPayload,
  medicinesFor,
  mrsFromSaved,
  reviewRows,
  stepProblem,
  stepsFor,
} from "../logic";
import { storeStep } from "../storage";
import type { Answers, MrsDraft, StepId } from "../types";
import { CycleStep } from "./CycleStep";
import { MrsStep } from "./MrsStep";
import { NotesStep } from "./NotesStep";
import { ProgressStep } from "./ProgressStep";
import { ReasonStep } from "./ReasonStep";
import { ReviewStep } from "./ReviewStep";
import { Notice, ScreenBody, ScreenFooter, ScreenHeader } from "./Screen";
import { TreatmentStep } from "./TreatmentStep";

/** Answers not yet saved, kept when the session ends so the patient does not lose them. */
export interface Draft {
  answers: Answers;
  mrs: MrsDraft;
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
  const answers = answersFromSaved(form.answers);
  if (form.kind === "followup") answers.medicines = medicinesFor(answers, form.current_medicines);
  return { answers, mrs: mrsFromSaved(form.mrs) };
}

/** The questions, one screen at a time, after the date of birth was confirmed. */
export function FormFlow({ token, session, form, initialStep, draft, onSent, onGone }: FormFlowProps) {
  const [start] = useState(() => draft ?? initialDraft(form));
  const [answers, setAnswers] = useState<Answers>(start.answers);
  const [mrs, setMrs] = useState<MrsDraft>(start.mrs);
  const [index, setIndex] = useState(initialStep);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  // Background saves run one after another so an older one never lands last.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const kind = form.kind;
  const steps = stepsFor(kind, answers);
  const current = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[current];

  const failed = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 410) {
      onGone(err, { answers, mrs });
      return;
    }
    setProblem(apiErrorMessage(err, fallback));
  };

  const go = (next: number) => {
    setIndex(next);
    setProblem(null);
    setSaved(null);
    storeStep(token, next);
    window.scrollTo({ top: 0 });
  };

  const change = (patch: Partial<Answers>) => {
    setAnswers((prev) => ({ ...prev, ...patch }));
    setProblem(null);
    setSaved(null);
  };

  const changeMrs = (next: MrsDraft) => {
    setMrs(next);
    setProblem(null);
    setSaved(null);
  };

  const goTo = (target: StepId) => go(Math.max(0, steps.indexOf(target)));

  function next() {
    const why = stepProblem(step, answers, mrs);
    if (why) {
      setProblem(why);
      return;
    }
    go(current + 1);
    // Keep progress on the server as the patient goes; a failure here only matters if the link is gone.
    const payload = buildPayload(kind, answers, mrs);
    saving.current = saving.current
      .then(() => patientFormApi.save(session, payload))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 410) onGone(err, { answers, mrs });
      });
  }

  async function saveForLater() {
    setBusy("save");
    setProblem(null);
    try {
      await saving.current;
      await patientFormApi.save(session, buildPayload(kind, answers, mrs));
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
      await patientFormApi.submit(session, buildPayload(kind, answers, mrs));
      onSent(false);
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiError && err.code === "FORM_COMPLETE") {
        onSent(true);
      } else if (err instanceof ApiError && err.code === "MRS_REQUIRED") {
        goTo("mrs");
        setProblem("Answer the symptom questions before sending.");
      } else {
        failed(err, "We could not send your form. Check your connection and try again.");
      }
    }
  }

  const isReview = step === "review";

  return (
    <>
      <ScreenHeader clinic={form.clinic_name} step={{ title: stepTitles[step], index: current, total: steps.length }}>
        <button
          type="button"
          onClick={saveForLater}
          disabled={busy !== null}
          className="cursor-pointer self-start text-[13px] font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "save" ? "Saving…" : "Save and finish later"}
        </button>
      </ScreenHeader>
      <ScreenBody>
        {step === "reasons" ? <ReasonStep answers={answers} onChange={change} /> : null}
        {step === "periods" ? <CycleStep answers={answers} onChange={change} /> : null}
        {step === "mrs" ? <MrsStep scores={mrs} onChange={changeMrs} /> : null}
        {step === "notes" ? <NotesStep answers={answers} onChange={change} /> : null}
        {step === "progress" ? <ProgressStep answers={answers} onChange={change} previous={form.previous_mrs} /> : null}
        {step === "treatment" ? <TreatmentStep answers={answers} onChange={change} /> : null}
        {isReview ? <ReviewStep rows={reviewRows(kind, answers, mrs)} onEdit={goTo} /> : null}
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
