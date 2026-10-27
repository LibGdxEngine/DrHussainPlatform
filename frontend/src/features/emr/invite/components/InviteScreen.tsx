"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { staffApi, type InvitationSent } from "@/lib/api/emr/staff";
import { emrRoutes } from "../../routes";
import { useMe } from "../../shell/useMe";
import { ActionButton, ActionLink } from "../../ui/Action";
import { Field, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { inviteRoles, type InviteRole } from "../data";
import { RolePicker } from "./RolePicker";

function CopyLink({ link }: { link: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("yes");
    } catch {
      input.current?.select();
      setCopied("manual");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <TextInput
          ref={input}
          readOnly
          value={link}
          aria-label="Join link"
          onFocus={(e) => e.currentTarget.select()}
          className="font-emr-mono text-xs"
        />
        <ActionButton onClick={copy} variant="outline" className="flex-none">
          {copied === "yes" ? "Copied" : "Copy"}
        </ActionButton>
      </div>
      <span role="status" className="text-xs text-muted">
        {copied === "manual" ? "The link is selected: copy it with your keyboard or long-press." : null}
      </span>
    </div>
  );
}

/** Doctor only: invite a colleague by email; the join link comes back to copy either way. */
export function InviteScreen() {
  const me = useMe();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvitationSent | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setEmailError(null);
    try {
      setSent(await staffApi.invitations.create(email.trim(), role));
    } catch (err) {
      if (err instanceof ApiError && err.fields.email?.length) setEmailError(err.fields.email.join(" "));
      else setError(apiErrorMessage(err, "Could not create the invitation. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setSent(null);
    setEmail("");
    setRole("MEMBER");
  };

  const header = (
    <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-6">
      <div className="flex flex-col gap-1.5">
        <Link href={emrRoutes.audit} className="text-[13px] text-muted no-underline">
          ← Users and permissions
        </Link>
        <h1 className="m-0 text-[30px] font-bold">Invite a new user</h1>
      </div>
    </section>
  );

  if (me && !me.is_lead) {
    return (
      <>
        {header}
        <Panel className="p-6">
          <p role="alert" className="m-0 text-sm text-ink-2">Only the doctor can invite users. Ask them to send the invitation.</p>
        </Panel>
      </>
    );
  }

  if (sent) {
    const roleLabel = inviteRoles.find((r) => r.id === sent.invitation.role)?.label ?? sent.invitation.role;
    return (
      <>
        {header}
        <Panel aria-labelledby="sent" className="flex max-w-[640px] flex-col gap-4 p-6">
          <h2 id="sent" className="m-0 text-lg font-semibold">Invitation ready for {sent.invitation.email}</h2>
          <p
            role="status"
            className={sent.emailed
              ? "m-0 rounded-xl bg-ok-tint px-3.5 py-3 text-sm text-ok-ink"
              : "m-0 rounded-xl bg-warn-tint px-3.5 py-3 text-sm text-warn-ink"}
          >
            {sent.emailed ? "✓ " : "Not emailed: "}
            {sent.notice}
          </p>
          <p className="m-0 text-sm text-ink-2">
            Role: <strong>{roleLabel}</strong>. {sent.emailed ? "You can also" : "Send them this link yourself, or"} copy the
            link below and send it by WhatsApp. Anyone with the link can see the invitation, so send it only to this person.
          </p>
          <CopyLink link={sent.link} />
          <p className="m-0 text-xs text-muted">
            They open the link, create their account (or sign in with {sent.invitation.email}) and join the clinic. The
            link works until {new Date(sent.invitation.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <ActionButton onClick={reset}>Invite someone else</ActionButton>
            <ActionLink href={emrRoutes.audit} variant="quiet">Back to users</ActionLink>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      {header}
      <Panel aria-labelledby="ud" className="max-w-[640px] p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 id="ud" className="m-0 text-lg font-semibold">Who are you inviting?</h2>
          <Field label="Email">
            <TextInput
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
          </Field>
          {emailError ? <p id="email-error" role="alert" className="m-0 text-xs text-danger-ink">{emailError}</p> : null}
          <RolePicker value={role} onChange={setRole} />
          {error ? <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3.5 py-3 text-sm text-danger-ink">{error}</p> : null}
          <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
            The invitation is emailed from the clinic mailbox when it is set up, and you also get the link to copy. They
            create their account with this email and confirm their mobile by WhatsApp. To make someone an owner, change
            their role in the user list after they join. This is recorded in the audit log.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <ActionButton type="submit" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</ActionButton>
            <ActionLink href={emrRoutes.audit} variant="quiet">Cancel</ActionLink>
          </div>
        </form>
      </Panel>
    </>
  );
}
