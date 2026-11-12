"use client";

import type { AnswerValue, CatalogueQuestion } from "@/lib/api/emr/intake";
import { cn } from "@/lib/utils";
import { isRequired, modulesFor, type FormContext } from "../logic";
import type { Answers, MrsDraft, Step } from "../types";
import { ConditionalCard } from "./controls";
import { MrsStep } from "./MrsStep";
import { QuestionField, hasInput, labelledByControl } from "./QuestionField";

interface QuestionStepProps {
  step: Step;
  ctx: FormContext;
  answers: Answers;
  onChange: (questionId: string, value: AnswerValue | undefined) => void;
  /** Questions filled in from her earlier forms or the clinic's records, not yet confirmed. */
  carried: ReadonlySet<string>;
  onConfirm: (questionId: string) => void;
  /** Questions to point out after Continue or the server refused them. */
  marked: ReadonlySet<string>;
  mrs: MrsDraft;
  onMrs: (scores: MrsDraft) => void;
  /** Shown above the questions (the follow-up's earlier scores). */
  before?: React.ReactNode;
}

function CarriedNote({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-tint px-3.5 py-2.5 text-sm text-brand-deep">
      <span className="min-w-0 flex-1">Filled in from what the clinic already has. Still correct? Change it if not.</span>
      <button
        type="button"
        onClick={onConfirm}
        className="min-h-11 cursor-pointer rounded-xl border border-brand bg-white px-3 text-[13px] font-semibold text-brand"
      >
        Yes, still correct
      </button>
    </div>
  );
}

function QuestionBlock({ question, required, carried, marked, value, onChange, onConfirm }: {
  question: CatalogueQuestion;
  required: boolean;
  carried: boolean;
  marked: boolean;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  onConfirm: () => void;
}) {
  const inputId = `q-${question.id}`;
  const tag = required ? <span className="ms-2 text-xs font-semibold text-muted">Required</span> : null;
  return (
    <div
      className={cn("flex flex-col gap-2", marked && "rounded-2xl border-2 border-danger-ink p-3")}
      aria-invalid={marked || undefined}
    >
      {labelledByControl(question) ? (
        tag
      ) : hasInput(question) ? (
        <label htmlFor={inputId} className="text-[15px] font-semibold leading-[1.6]">{question.label}{tag}</label>
      ) : (
        <span className="text-[15px] font-semibold leading-[1.6]">{question.label}{tag}</span>
      )}
      {carried ? <CarriedNote onConfirm={onConfirm} /> : null}
      <QuestionField spec={question} inputId={inputId} value={value} onChange={onChange} />
    </div>
  );
}

/** One topic of the form: its questions as the catalogue describes them, shown for her answers so far. */
export function QuestionStep({ step, ctx, answers, onChange, carried, onConfirm, marked, mrs, onMrs, before }: QuestionStepProps) {
  const modules = modulesFor(ctx, answers);
  const mrsQuestion = step.questions.find((q) => q.type === "mrs");
  return (
    <>
      {step.intro ? <p className="m-0 text-[15px] leading-[1.7] text-ink-3">{step.intro}</p> : null}
      {before}
      {step.mrs ? <MrsStep title={mrsQuestion?.label} scores={mrs} onChange={onMrs} marked={marked.has("mrs")} /> : null}
      {step.questions.filter((q) => q.type !== "mrs").map((question) => {
        const block = (
          <QuestionBlock
            key={question.id}
            question={question}
            required={isRequired(question, ctx, answers, modules)}
            carried={carried.has(question.id)}
            marked={marked.has(question.id)}
            value={answers[question.id]}
            onChange={(value) => onChange(question.id, value)}
            onConfirm={() => onConfirm(question.id)}
          />
        );
        return question.show_if ? (
          <ConditionalCard key={question.id} reason="Shown because of an earlier answer">{block}</ConditionalCard>
        ) : block;
      })}
    </>
  );
}
