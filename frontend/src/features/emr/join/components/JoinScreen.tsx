"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { staffApi, type JoinPreview } from "@/lib/api/emr/staff";
import { roleInfo } from "../../audit/data";
import { emrRoutes } from "../../routes";
import { Logo } from "../../shell/Logo";
import { ActionButton } from "../../ui/Action";
import { invitationProblem } from "../logic";
import { forgetJoin, rememberToken, storedChallenge, useJoinToken } from "../storage";
import { SignupFlow } from "./SignupFlow";

// Back to this page after sign-in; the token waits in sessionStorage because the fragment is dropped.
const signinHref = `${emrRoutes.signin}?callbackUrl=${encodeURIComponent(emrRoutes.join)}`;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-5 bg-canvas p-4 sm:p-5 lg:my-8 lg:min-h-0 lg:rounded-[32px] lg:shadow-frame">
      <Logo size="hero" className="px-2 pt-2" />
      <main className="flex flex-col gap-5 rounded-[26px] bg-white p-6">{children}</main>
    </div>
  );
}

function Problem({ title, message, signin }: { title: string; message: string; signin?: boolean }) {
  return (
    <>
      <h1 className="m-0 text-[28px] font-bold leading-tight">{title}</h1>
      <p role="alert" className="m-0 text-[15px] leading-[1.7] text-ink-2">{message}</p>
      {signin ? (
        <Link href={emrRoutes.signin} className="self-start font-semibold text-brand">Go to sign-in</Link>
      ) : null}
    </>
  );
}

type Loaded = { token: string; preview: JoinPreview } | { token: string; error: string; notFound: boolean };

/** Signed in already: join with this account, or sign out if it's the wrong one. */
function JoinAsSignedIn({ preview, signedInAs, onJoin }: {
  preview: JoinPreview;
  signedInAs: string;
  onJoin: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; mismatch: boolean } | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await onJoin();
    } catch (err) {
      setBusy(false);
      const mismatch = err instanceof ApiError && err.code === "EMAIL_MISMATCH";
      setError({
        text: mismatch
          ? `You are signed in as ${signedInAs || "another account"}, but this invitation is for ${preview.email}. Sign out, then sign in or create an account with ${preview.email}.`
          : apiErrorMessage(err, "Could not join the clinic. Check your connection and try again."),
        mismatch,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-ink-2">
        Signed in as <strong className="font-emr-mono">{signedInAs || "your account"}</strong>.
      </p>
      {error ? (
        <p role="alert" className="m-0 rounded-[14px] bg-danger-tint px-3.5 py-3 text-[13px] text-danger-ink">{error.text}</p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        {!error?.mismatch ? (
          <ActionButton size="lg" onClick={join} disabled={busy}>
            {busy ? "Joining…" : `Join ${preview.clinic_name}`}
          </ActionButton>
        ) : null}
        <ActionButton size="lg" variant={error?.mismatch ? "primary" : "quiet"} onClick={() => signOut({ redirect: false })} disabled={busy}>
          Sign out
        </ActionButton>
      </div>
    </div>
  );
}

/** `/emr/join#t=<token>`: see the invitation, then join with an existing or a new account. */
export function JoinScreen() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const token = useJoinToken();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"choose" | "signup" | null>(null);

  useEffect(() => {
    if (!token) return;
    rememberToken(token);
    let cancelled = false;
    staffApi.join.preview(token).then(
      (preview) => !cancelled && setLoaded({ token, preview }),
      (err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.code === "INVITATION_NOT_FOUND";
        setLoaded({ token, notFound, error: apiErrorMessage(err, "Could not open the invitation. Check your connection.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  async function join(t: string) {
    await staffApi.join.accept(t);
    forgetJoin();
    router.replace(emrRoutes.today);
    router.refresh();
  }

  if (token === null) {
    const p = invitationProblem("NO_TOKEN")!;
    return <Card><Problem title={p.title} message={p.message} /></Card>;
  }
  const current = loaded && loaded.token === token ? loaded : null;
  if (!token || !current) {
    return (
      <Card>
        <h1 className="m-0 text-[28px] font-bold">Opening your invitation…</h1>
        <p role="status" className="m-0 text-sm text-muted">This only takes a moment.</p>
      </Card>
    );
  }
  if ("error" in current) {
    if (current.notFound) {
      const p = invitationProblem("NOT_FOUND")!;
      return <Card><Problem title={p.title} message={p.message} /></Card>;
    }
    return (
      <Card>
        <Problem title="We could not open the invitation" message={current.error} />
        <ActionButton className="self-start" onClick={() => { setLoaded(null); setAttempt((a) => a + 1); }}>Try again</ActionButton>
      </Card>
    );
  }

  const { preview } = current;
  const problem = invitationProblem(preview.status);
  if (problem) {
    return (
      <Card>
        <Problem title={problem.title} message={problem.message} signin={preview.status === "ACCEPTED"} />
      </Card>
    );
  }

  const role = roleInfo[preview.role];
  // A sign-up in progress keeps its screen even once it signs in.
  const effectiveMode = mode ?? (storedChallenge(token) ? "signup" : "choose");

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="self-start rounded-full bg-brand-tint px-3.5 py-1.5 text-[13px] font-semibold text-ok-ink">Invitation</span>
        <h1 className="m-0 text-[28px] font-bold leading-tight">Join {preview.clinic_name}</h1>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-muted">For</dt>
          <dd className="m-0 break-all font-emr-mono text-sm">{preview.email}</dd>
          <dt className="text-muted">Role</dt>
          <dd className="m-0">{role.label} · {role.short}</dd>
        </dl>
      </div>
      {effectiveMode === "signup" ? (
        <SignupFlow
          token={token}
          email={preview.email}
          clinic={preview.clinic_name}
          signinHref={signinHref}
          onJoin={() => join(token)}
        />
      ) : status === "loading" ? (
        <p role="status" className="m-0 text-sm text-muted">Checking whether you are signed in…</p>
      ) : status === "authenticated" ? (
        <JoinAsSignedIn preview={preview} signedInAs={session?.email ?? session?.user?.email ?? ""} onJoin={() => join(token)} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[15px] leading-[1.7] text-ink-2">
            New to the clinic&apos;s EMR? Create your account with {preview.email}. Your mobile is confirmed by a WhatsApp code.
          </p>
          <ActionButton size="lg" onClick={() => setMode("signup")}>Create my account</ActionButton>
          <Link
            href={signinHref}
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-line-strong px-6 text-[15px] font-semibold text-ink no-underline hover:border-brand hover:text-brand"
          >
            I already have an account: sign in
          </Link>
        </div>
      )}
    </Card>
  );
}
