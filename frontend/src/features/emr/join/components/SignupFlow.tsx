"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { ActionButton } from "../../ui/Action";
import { Field, TextInput } from "../../ui/Fields";
import { accountsApi } from "@/lib/api/emr/accounts";
import { codeDigits, errorLines, signupProblem, type SignupDraft } from "../logic";
import { rememberChallenge, storedChallenge, type StoredChallenge } from "../storage";

interface SignupFlowProps {
  token: string;
  email: string;
  clinic: string;
  signinHref: string;
  /** Accepts the invitation as the signed-in account and leaves the page; rejects with the API error. */
  onJoin: () => Promise<void>;
}

function Errors({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-[14px] bg-danger-tint px-3.5 py-3 text-[13px] text-danger-ink">
      {lines.map((l) => <span key={l}>{l}</span>)}
    </div>
  );
}

const lines = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.status !== 0 ? errorLines(err) : [apiErrorMessage(err, fallback)];

/** New account for the invited email: details → WhatsApp code → sign in → join. */
export function SignupFlow({ token, email, clinic, signinHref, onJoin }: SignupFlowProps) {
  const [draft, setDraft] = useState<SignupDraft>({ firstName: "", lastName: "", phone: "", password: "", confirm: "" });
  // A reload during the code step keeps the challenge but not the password (never stored).
  const [challenge, setChallenge] = useState<StoredChallenge | null>(() => storedChallenge(token));
  const [password, setPassword] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [signInNeeded, setSignInNeeded] = useState(false);

  const edit = (patch: Partial<SignupDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors([]);
  };

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    const problem = signupProblem(draft);
    if (problem) {
      setErrors([problem]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const result = await accountsApi.signup({
        email,
        phone: draft.phone.trim(),
        password: draft.password,
        first_name: draft.firstName.trim(),
        last_name: draft.lastName.trim(),
      });
      const next = { token, challengeId: result.challenge_id, destination: result.destination };
      rememberChallenge(next);
      setPassword(draft.password);
      setChallenge(next);
    } catch (err) {
      setErrors(lines(err, "Could not create your account. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    if (code.length < 4) {
      setErrors(["Enter the code from WhatsApp."]);
      return;
    }
    setBusy(true);
    setErrors([]);
    setInfo(null);
    try {
      await accountsApi.confirm({ challenge_id: challenge.challengeId, code });
    } catch (err) {
      setBusy(false);
      setErrors(lines(err, "Could not check the code. Try again."));
      return;
    }
    if (!password) {
      setBusy(false);
      setSignInNeeded(true);
      return;
    }
    const result = await signIn("credentials", { redirect: false, identifier: email, password });
    if (!result || result.error) {
      setBusy(false);
      setSignInNeeded(true);
      return;
    }
    try {
      await onJoin();
    } catch (err) {
      setBusy(false);
      setErrors(lines(err, "Your account is ready, but joining the clinic failed. Try again from the link."));
    }
  }

  async function resend() {
    if (!challenge) return;
    setBusy(true);
    setErrors([]);
    setInfo(null);
    try {
      await accountsApi.resend({ challenge_id: challenge.challengeId });
      setInfo("A new code was sent by WhatsApp.");
    } catch (err) {
      setErrors(lines(err, "Could not send a new code. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  if (signInNeeded) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-2xl font-bold">Your account is ready</h2>
        <p role="status" className="m-0 text-[15px] leading-[1.7] text-ink-2">
          Your mobile number is confirmed. Sign in with {email} and your new password to join {clinic}.
        </p>
        <Link href={signinHref} className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand px-6 text-[15px] font-semibold text-white no-underline hover:bg-brand-ink">
          Sign in to join
        </Link>
      </div>
    );
  }

  if (challenge) {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-2xl font-bold">Confirm your mobile</h2>
          <p className="m-0 text-[15px] leading-[1.7] text-ink-2">
            We sent a code by WhatsApp{challenge.destination ? <> to <strong className="font-emr-mono">{challenge.destination}</strong></> : null}.
            Enter it below. It works for a few minutes.
          </p>
        </div>
        <Errors lines={errors} />
        {info ? <p role="status" className="m-0 rounded-[14px] bg-ok-tint px-3.5 py-3 text-[13px] text-ok-ink">{info}</p> : null}
        <Field label="Code from WhatsApp">
          <TextInput
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              setCode(codeDigits(e.target.value));
              setErrors([]);
            }}
            className="font-emr-mono text-lg tracking-[0.3em]"
          />
        </Field>
        <ActionButton type="submit" size="lg" disabled={busy}>
          {busy ? "Checking…" : `Confirm and join ${clinic}`}
        </ActionButton>
        <button type="button" onClick={resend} disabled={busy} className="cursor-pointer self-start text-sm font-semibold text-brand disabled:opacity-60">
          Send a new code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={createAccount} className="flex flex-col gap-4" noValidate>
      <h2 className="m-0 text-2xl font-bold">Create your account</h2>
      <Errors lines={errors} />
      <Field label="Email">
        <TextInput value={email} readOnly aria-readonly className="bg-canvas font-emr-mono" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <TextInput autoComplete="given-name" required value={draft.firstName} onChange={(e) => edit({ firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <TextInput autoComplete="family-name" required value={draft.lastName} onChange={(e) => edit({ lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Mobile (WhatsApp)">
        <TextInput
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="e.g. 010 1234 5678"
          required
          value={draft.phone}
          onChange={(e) => edit({ phone: e.target.value })}
        />
      </Field>
      <Field label="Password (at least 8 characters)">
        <TextInput type="password" autoComplete="new-password" required value={draft.password} onChange={(e) => edit({ password: e.target.value })} />
      </Field>
      <Field label="Password again">
        <TextInput type="password" autoComplete="new-password" required value={draft.confirm} onChange={(e) => edit({ confirm: e.target.value })} />
      </Field>
      <ActionButton type="submit" size="lg" disabled={busy}>
        {busy ? "Creating your account…" : "Create account"}
      </ActionButton>
      <p className="m-0 text-[13px] text-muted">
        Already have an account with this email? <Link href={signinHref} className="font-semibold text-brand">Sign in instead</Link>
      </p>
    </form>
  );
}
