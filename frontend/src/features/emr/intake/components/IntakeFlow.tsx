"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/emr/errors";
import { patientFormApi, type LinkOpened, type PatientForm } from "@/lib/api/emr/intake";
import { linkProblem } from "../logic";
import { clearSession, storeSession, storedSession, useHashToken } from "../storage";
import { FormFlow, type Draft } from "./FormFlow";
import { Screen, ScreenBody, ScreenFooter, ScreenHeader } from "./Screen";
import { VerifyStep } from "./VerifyStep";

const FALLBACK_CLINIC = "V-Clinic";

type Phase =
  | { kind: "loading" }
  | { kind: "problem"; code?: string }
  | { kind: "verify"; opened: LinkOpened }
  | { kind: "form"; form: PatientForm; session: string; step: number; draft?: Draft }
  | { kind: "sent"; already: boolean; clinic: string; firstName: string };

function StatusScreen({ clinic, title, children, action }: {
  clinic: string;
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <>
      <ScreenHeader clinic={clinic} />
      <ScreenBody className="gap-3">
        <h1 className="m-0 text-[26px] font-bold leading-[1.35]">{title}</h1>
        <div className="flex flex-col gap-3 text-base leading-[1.7] text-ink-3">{children}</div>
      </ScreenBody>
      {action ? <ScreenFooter primary={action} /> : null}
    </>
  );
}

const codeOf = (err: unknown) => (err instanceof ApiError && err.status !== 0 ? err.code : undefined);

/** One link's form: open → date of birth → questions → sent. */
function LinkFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const draft = useRef<Draft | undefined>(undefined);
  const lastStep = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const sentPhase = (f: { clinic_name: string; first_name: string }): Phase => ({
      kind: "sent", already: true, clinic: f.clinic_name, firstName: f.first_name,
    });
    (async () => {
      const saved = storedSession(token);
      if (saved) {
        try {
          const form = await patientFormApi.get(saved.session);
          if (cancelled) return;
          if (form.status === "complete") {
            clearSession();
            setPhase(sentPhase(form));
          } else {
            setPhase({ kind: "form", form, session: saved.session, step: saved.step });
          }
          return;
        } catch (err) {
          if (codeOf(err) !== "SESSION_EXPIRED") throw err;
          clearSession();
        }
      }
      const opened = await patientFormApi.open(token);
      if (cancelled) return;
      setPhase(opened.status === "complete" ? sentPhase(opened) : { kind: "verify", opened });
    })().catch((err: unknown) => {
      if (cancelled) return;
      if (codeOf(err) === "LINK_INVALID" || codeOf(err) === "LINK_LOCKED") clearSession();
      setPhase({ kind: "problem", code: codeOf(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  async function verified(session: string) {
    storeSession(token, session, lastStep.current);
    try {
      const form = await patientFormApi.get(session);
      setNotice(undefined);
      setPhase(form.status === "complete"
        ? { kind: "sent", already: true, clinic: form.clinic_name, firstName: form.first_name }
        : { kind: "form", form, session, step: lastStep.current, draft: draft.current });
      draft.current = undefined;
    } catch (err) {
      setPhase({ kind: "problem", code: codeOf(err) });
    }
  }

  function gone(err: ApiError, unsaved?: Draft) {
    lastStep.current = storedSession(token)?.step ?? lastStep.current;
    clearSession();
    if (err.code === "SESSION_EXPIRED") {
      draft.current = unsaved;
      setNotice("Your session ended. Enter your date of birth again to carry on. Your answers on this page are kept.");
      setPhase({ kind: "loading" });
      setAttempt((a) => a + 1);
      return;
    }
    setPhase({ kind: "problem", code: err.code });
  }

  if (phase.kind === "loading") {
    return (
      <StatusScreen clinic={FALLBACK_CLINIC} title="Opening your form…">
        <p className="m-0" role="status">This only takes a moment.</p>
      </StatusScreen>
    );
  }
  if (phase.kind === "problem") {
    const p = linkProblem(phase.code);
    return (
      <StatusScreen
        clinic={FALLBACK_CLINIC}
        title={p.title}
        action={p.retry ? { label: "Try again", onClick: () => { setPhase({ kind: "loading" }); setAttempt((a) => a + 1); } } : undefined}
      >
        <p className="m-0" role="alert">{p.message}</p>
      </StatusScreen>
    );
  }
  if (phase.kind === "verify") {
    return <VerifyStep token={token} opened={phase.opened} notice={notice} onVerified={verified} onGone={(err) => gone(err)} />;
  }
  if (phase.kind === "sent") {
    return (
      <StatusScreen clinic={phase.clinic} title={phase.already ? "This form has been sent" : `Thank you, ${phase.firstName}`}>
        {phase.already ? (
          <p className="m-0">
            You have already sent this form to {phase.clinic}, so it cannot be changed. If anything has changed, tell the
            clinic at your visit.
          </p>
        ) : (
          <>
            <p className="m-0" role="status">Your answers were sent to {phase.clinic}. The doctor will read them before your visit.</p>
            <p className="m-0">You can close this page now.</p>
          </>
        )}
      </StatusScreen>
    );
  }
  return (
    <FormFlow
      token={token}
      session={phase.session}
      form={phase.form}
      initialStep={phase.step}
      draft={phase.draft}
      onSent={(already) => {
        clearSession();
        setPhase({ kind: "sent", already, clinic: phase.form.clinic_name, firstName: phase.form.first_name });
      }}
      onGone={(err, unsaved) => gone(err, unsaved)}
    />
  );
}

/** The patient's form, opened from the link the clinic sent (`/emr/intake#t=<token>`). */
export function IntakeFlow() {
  const token = useHashToken();
  let content: React.ReactNode;
  if (token === undefined) {
    content = (
      <StatusScreen clinic={FALLBACK_CLINIC} title="Opening your form…">
        <p className="m-0" role="status">This only takes a moment.</p>
      </StatusScreen>
    );
  } else if (token === null) {
    const p = linkProblem("NO_TOKEN");
    content = (
      <StatusScreen clinic={FALLBACK_CLINIC} title={p.title}>
        <p className="m-0" role="alert">{p.message}</p>
      </StatusScreen>
    );
  } else {
    content = <LinkFlow key={token} token={token} />;
  }
  return <Screen>{content}</Screen>;
}
