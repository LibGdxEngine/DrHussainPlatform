"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton } from "@/features/emr/ui/Action";
import { Field, TextInput } from "@/features/emr/ui/Fields";
import { Icon } from "@/features/emr/ui/icons";

/** Only same-site EMR paths may be returned to after sign-in. */
function safeReturnPath(path?: string) {
  return path && path.startsWith("/emr/") && !path.startsWith("//") ? path : emrRoutes.today;
}

interface PasswordPanelProps {
  returnTo?: string;
}

/** Staff sign-in: email or mobile and password, checked by the platform's account service. */
export function PasswordPanel({ returnTo }: PasswordPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", { redirect: false, identifier, password });
    if (result?.error) {
      setBusy(false);
      setError(result.error.includes("PHONE_VERIFICATION_REQUIRED")
        ? "This account's mobile number is not verified yet. Ask the clinic owner to finish setting it up."
        : "The email, mobile or password is not correct.");
      return;
    }
    router.replace(safeReturnPath(returnTo));
    router.refresh();
  }

  return (
    <section
      aria-label="Staff sign-in"
      className="flex flex-1 items-center justify-center rounded-[26px] bg-white p-6"
    >
      <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[32px] font-bold">Sign in</h2>
          <p className="m-0 text-[15px] text-muted">Use the email or mobile number registered with the clinic.</p>
        </div>
        {error ? (
          <p role="alert" className="m-0 rounded-[14px] bg-danger-tint px-3.5 py-3 text-[13px] text-danger-ink">
            {error}
          </p>
        ) : null}
        <Field label="Email or mobile">
          <TextInput
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ActionButton type="submit" size="lg" disabled={busy}>
          <Icon name="key" size={20} />
          {busy ? "Signing in…" : "Sign in"}
        </ActionButton>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Forgotten your password? Ask the clinic owner to reset it. Recovery requires the doctor&apos;s approval.
        </p>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-canvas px-3.5 py-3 text-[13px] text-ink-3">
          <Icon name="lock" size={18} className="flex-none" />
          Every sign-in, record opened and edit is logged.
        </div>
      </form>
    </section>
  );
}
