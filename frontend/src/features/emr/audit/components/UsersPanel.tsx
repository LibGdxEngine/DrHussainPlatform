"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { staffApi, type Invitation, type Member, type MemberRole } from "@/lib/api/emr/staff";
import { emrRoutes } from "../../routes";
import { useMe } from "../../shell/useMe";
import { ActionButton, ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { memberControls, roleInfo } from "../data";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const roleText = (role: MemberRole | undefined) => (role ? `${roleInfo[role].label} · ${roleInfo[role].short}` : "No role");

function Initial({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-brand-tint font-bold text-brand-deep">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Inline "are you sure" with the action and a way back. */
function Confirm({ text, action, busy, onConfirm, onCancel }: {
  text: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label={text} className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">
      <span className="flex-1">{text}</span>
      <ActionButton size="sm" variant="quiet" className="bg-white" onClick={onCancel} disabled={busy}>Cancel</ActionButton>
      <ActionButton size="sm" className="bg-danger hover:bg-danger-ink" onClick={onConfirm} disabled={busy}>
        {busy ? "Working…" : action}
      </ActionButton>
    </div>
  );
}

type Pending = { kind: "remove" | "revoke"; id: string } | null;

/** The clinic's users and pending invitations. Everyone sees the list; only the doctor changes it. */
export function UsersPanel() {
  const me = useMe();
  const lead = me?.is_lead ?? false;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    let cancelled = false;
    staffApi.members.list().then(
      (list) => !cancelled && setMembers(list),
      (err: unknown) => !cancelled && setLoadError(apiErrorMessage(err, "Could not load the users.")),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lead) return;
    let cancelled = false;
    staffApi.invitations.list().then(
      (list) => !cancelled && setInvitations(list),
      (err: unknown) => !cancelled && setLoadError(apiErrorMessage(err, "Could not load the invitations.")),
    );
    return () => {
      cancelled = true;
    };
  }, [lead]);

  async function run(id: string, task: () => Promise<void>, fallback: string) {
    setBusy(id);
    setActionError(null);
    try {
      await task();
      setPending(null);
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  const changeRole = (member: Member, role: MemberRole) =>
    run(member.id, async () => {
      const updated = await staffApi.members.setRole(member.id, role);
      setMembers((list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? null);
    }, "Could not change the role.");

  const remove = (member: Member) =>
    run(member.id, async () => {
      await staffApi.members.remove(member.id);
      setMembers((list) => list?.filter((m) => m.id !== member.id) ?? null);
    }, "Could not remove this user.");

  const revoke = (invitation: Invitation) =>
    run(invitation.id, async () => {
      await staffApi.invitations.revoke(invitation.id);
      setInvitations((list) => list?.filter((i) => i.id !== invitation.id) ?? null);
    }, "Could not withdraw the invitation.");

  return (
    <Panel aria-labelledby="us" className="flex flex-col gap-3 p-5">
      <div className="flex items-center">
        <h2 id="us" className="m-0 text-lg font-semibold">
          Users
        </h2>
        {lead ? (
          <ActionLink href={emrRoutes.invite} size="sm" className="ms-auto min-h-[38px] px-4">
            + Invite user
          </ActionLink>
        ) : null}
      </div>
      {loadError ? <p role="alert" className="m-0 text-sm text-danger-ink">{loadError}</p> : null}
      {actionError ? <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2 text-sm text-danger-ink">{actionError}</p> : null}
      {!members && !loadError ? <p className="m-0 text-sm text-muted" role="status">Loading users…</p> : null}
      {members && !members.length ? <p className="m-0 text-sm text-muted">No users yet.</p> : null}
      {members?.map((m) => {
        const controls = memberControls(me, m);
        const confirming = pending?.kind === "remove" && pending.id === m.id;
        return (
          <div key={m.id} className="flex flex-col gap-2 rounded-2xl bg-canvas-2 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Initial name={m.name} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <strong className="truncate text-sm font-semibold">{m.name || m.email}</strong>
                  {m.is_me ? <Pill tone="ok" size="xs">You</Pill> : null}
                </span>
                <span className="truncate font-emr-mono text-xs text-muted">{m.email}</span>
                {m.phone ? <span className="font-emr-mono text-xs text-muted">{m.phone}</span> : null}
                <span className="text-[11px] text-subtle">
                  {m.last_login ? `Last signed in ${when(m.last_login)}` : "Has not signed in yet"}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1.5">
                {controls.roleOptions.length ? (
                  <select
                    aria-label={`Role for ${m.name || m.email}`}
                    value={m.role ?? "MEMBER"}
                    disabled={busy === m.id}
                    onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                    className="min-h-9 rounded-full border border-field bg-white px-3 text-xs outline-none focus:border-brand"
                  >
                    {controls.roleOptions.map((r) => (
                      <option key={r} value={r}>{roleText(r)}</option>
                    ))}
                  </select>
                ) : (
                  <Pill tone={m.role === "MEMBER" ? "neutral" : "brand"} size="sm" className="py-0.5">
                    {roleText(m.role)}
                  </Pill>
                )}
                {controls.canRemove && !confirming ? (
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "remove", id: m.id })}
                    className="cursor-pointer text-xs font-semibold text-danger-ink"
                  >
                    Remove
                  </button>
                ) : null}
              </span>
            </div>
            {confirming ? (
              <Confirm
                text={`Remove ${m.name || m.email} from the clinic? They will lose access straight away.`}
                action="Remove"
                busy={busy === m.id}
                onConfirm={() => remove(m)}
                onCancel={() => setPending(null)}
              />
            ) : null}
          </div>
        );
      })}
      {lead ? (
        <section aria-labelledby="inv" className="flex flex-col gap-2 pt-2">
          <h3 id="inv" className="m-0 text-sm font-semibold">Pending invitations</h3>
          {!invitations && !loadError ? <p className="m-0 text-xs text-muted" role="status">Loading invitations…</p> : null}
          {invitations && !invitations.length ? <p className="m-0 text-xs text-muted">No pending invitations.</p> : null}
          {invitations?.map((inv) => {
            const confirming = pending?.kind === "revoke" && pending.id === inv.id;
            return (
              <div key={inv.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-emr-mono text-[13px]">{inv.email}</span>
                    <span className="text-[11px] text-muted">
                      {roleText(inv.role)} · invited by {inv.invited_by_name || "the clinic"} · expires {when(inv.expires_at)}
                    </span>
                  </span>
                  {!confirming ? (
                    <ActionButton size="sm" variant="quiet" onClick={() => setPending({ kind: "revoke", id: inv.id })}>
                      Withdraw
                    </ActionButton>
                  ) : null}
                </div>
                {confirming ? (
                  <Confirm
                    text={`Withdraw the invitation to ${inv.email}? The link will stop working.`}
                    action="Withdraw"
                    busy={busy === inv.id}
                    onConfirm={() => revoke(inv)}
                    onCancel={() => setPending(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </section>
      ) : me ? (
        <p className="m-0 text-xs text-muted">Only the doctor can invite users, change roles or remove users.</p>
      ) : null}
    </Panel>
  );
}
