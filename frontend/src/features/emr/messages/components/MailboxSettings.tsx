"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ActionButton } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Switch } from "../../ui/Switch";
import { mailProviders, type MailboxAccount, type MailProvider } from "../data";

interface MailboxSettingsProps {
  account: MailboxAccount | null;
  onConnect: (provider: MailProvider, address: string) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

const syncOptions = ["Last 3 months", "Last 12 months", "Everything"];

/** Connect the doctor's mailbox (OAuth or IMAP) and choose how mail flows into patient files. */
export function MailboxSettings({ account, onConnect, onDisconnect, onClose }: MailboxSettingsProps) {
  const [provider, setProvider] = useState<MailProvider>(account?.provider ?? "google");
  const [address, setAddress] = useState(account?.address ?? "hsgohar@gmail.com");
  const [autoMatch, setAutoMatch] = useState(true);
  const [autoFile, setAutoFile] = useState(false);
  const [staffPatientsOnly, setStaffPatientsOnly] = useState(true);

  return (
    <Panel aria-labelledby="mbs" className="flex flex-col gap-4 p-6">
      <div className="flex items-center">
        <h2 id="mbs" className="m-0 text-xl font-semibold">
          {account ? "Mailbox settings" : "Connect the doctor's mailbox"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="ms-auto cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-brand"
        >
          Close
        </button>
      </div>
      <p className="m-0 text-sm leading-[1.7] text-muted">
        The whole inbox is synced into the platform: new emails appear here, and replies sent from here go out from the
        doctor&apos;s own address. Emails from a patient&apos;s address are linked to her file automatically.
      </p>

      {account ? null : (
        <div role="radiogroup" aria-label="Mail provider" className="grid gap-2 md:grid-cols-3">
          {mailProviders.map((p) => {
            const on = p.id === provider;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[18px] border p-4 text-start",
                  on ? "border-brand bg-brand-wash" : "border-line bg-white hover:border-brand",
                )}
              >
                <strong className="text-sm font-semibold">{p.label}</strong>
                <span className="text-xs leading-relaxed text-muted">{p.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Doctor's email address">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!account} />
        </Field>
        <Field label="Sync history">
          <SelectInput defaultValue="Last 12 months">
            {syncOptions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </SelectInput>
        </Field>
        {!account && provider === "imap" ? (
          <>
            <Field label="IMAP server">
              <TextInput placeholder="imap.example.com" />
            </Field>
            <Field label="SMTP server (for replies)">
              <TextInput placeholder="smtp.example.com" />
            </Field>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-line p-4">
        <SettingRow
          label="Link emails to patient files"
          hint="Match the sender's address to a patient; unknown senders get a suggested match."
          checked={autoMatch}
          onChange={setAutoMatch}
        />
        <SettingRow
          label="File patient attachments automatically"
          hint="Attachments go to Documents as “needs review” instead of waiting for Save to file."
          checked={autoFile}
          onChange={setAutoFile}
        />
        <SettingRow
          label="Reception sees patient emails only"
          hint="Personal and non-patient emails stay visible to the doctor only."
          checked={staffPatientsOnly}
          onChange={setStaffPatientsOnly}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {account ? (
          <>
            <span className="text-[13px] text-muted">Connected since {account.connectedSince}</span>
            <ActionButton variant="quiet" className="ms-auto" onClick={onDisconnect}>
              Disconnect mailbox
            </ActionButton>
            <ActionButton onClick={onClose}>Save settings</ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => onConnect(provider, address)} disabled={!address.trim()}>
            {provider === "imap" ? "Connect with IMAP" : `Sign in with ${provider === "google" ? "Google" : "Microsoft"}`}
          </ActionButton>
        )}
      </div>
      <p className="m-0 text-xs text-muted">Preview only: the real connection is made by the backend once it is built.</p>
    </Panel>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-col gap-0.5">
        <strong className="text-sm font-semibold">{label}</strong>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span className="ms-auto">
        <Switch label={label} checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}
