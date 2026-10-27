"use client";

import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { mailApi, type ConnectionCheck, type Mailbox, type MailboxUpdate, type MailSecurity } from "@/lib/api/emr/mail";
import { Notice, type NoticeState } from "../../settings/components/Notice";
import { ActionButton } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Switch } from "../../ui/Switch";
import { securityOptions } from "../data";

interface MailboxSettingsProps {
  mailbox: Mailbox | null;
  onSaved: (mailbox: Mailbox) => void;
  onClose: () => void;
}

type Form = Required<Pick<MailboxUpdate,
  "address" | "display_name" | "enabled" | "smtp_host" | "smtp_port" | "smtp_security" | "smtp_username"
  | "imap_host" | "imap_port" | "imap_security" | "imap_username" | "imap_folder">> & {
  smtp_password: string;
  imap_password: string;
};

function initialForm(m: Mailbox | null): Form {
  return {
    // A mailbox being set up for the first time is switched on by default.
    address: m?.address ?? "", display_name: m?.display_name ?? "", enabled: m?.address ? Boolean(m.enabled) : true,
    smtp_host: m?.smtp_host ?? "", smtp_port: m?.smtp_port ?? 587, smtp_security: m?.smtp_security ?? "starttls",
    smtp_username: m?.smtp_username ?? "", smtp_password: "",
    imap_host: m?.imap_host ?? "", imap_port: m?.imap_port ?? 993, imap_security: m?.imap_security ?? "ssl",
    imap_username: m?.imap_username ?? "", imap_password: "", imap_folder: m?.imap_folder ?? "INBOX",
  };
}

/**
 * The clinic's own mail server. Results emails leave from it and replies are read from it; the spec
 * rules out outside email services for patient data.
 */
export function MailboxSettings({ mailbox, onSaved, onClose }: MailboxSettingsProps) {
  const [form, setForm] = useState<Form>(() => initialForm(mailbox));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [check, setCheck] = useState<ConnectionCheck | null>(null);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setCheck(null);
    try {
      const saved = await mailApi.mailbox.update(form);
      setForm((f) => ({ ...f, smtp_password: "", imap_password: "" }));
      onSaved(saved);
      setNotice({ tone: "ok", text: "Mailbox saved. Use “Test connection” to check it." });
    } catch (err) {
      const forbidden = err instanceof ApiError && err.status === 403;
      setNotice({ tone: "error", text: forbidden ? "Only the doctor can change the mailbox." : apiErrorMessage(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setCheck(null);
    try {
      setCheck(await mailApi.mailbox.check());
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorMessage(err, "Could not test the connection.") });
    } finally {
      setBusy(false);
    }
  }

  const server = (prefix: "smtp" | "imap", title: string, hint: string) => (
    <fieldset className="m-0 grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
      <legend className="px-1 text-[13px] font-semibold">{title}</legend>
      <p className="m-0 text-xs text-muted sm:col-span-2">{hint}</p>
      <Field label="Server">
        <TextInput value={form[`${prefix}_host`]} onChange={set(`${prefix}_host`)} placeholder={`${prefix}.your-clinic-domain`} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port">
          <TextInput type="number" value={form[`${prefix}_port`]} onChange={set(`${prefix}_port`)} />
        </Field>
        <Field label="Security">
          <SelectInput value={form[`${prefix}_security`]} onChange={set(`${prefix}_security`)}>
            {securityOptions.map((o) => <option key={o.id} value={o.id as MailSecurity}>{o.label}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Username">
        <TextInput value={form[`${prefix}_username`]} onChange={set(`${prefix}_username`)} autoComplete="off" />
      </Field>
      <Field label={`Password${mailbox?.[`has_${prefix}_password`] ? " (saved; leave blank to keep)" : ""}`}>
        <TextInput type="password" value={form[`${prefix}_password`]} onChange={set(`${prefix}_password`)} autoComplete="new-password" />
      </Field>
    </fieldset>
  );

  return (
    <Panel aria-labelledby="mbs" className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="mbs" className="m-0 text-lg font-semibold">Clinic mailbox</h2>
          <p className="m-0 max-w-[720px] text-[13px] leading-[1.7] text-muted">
            The clinic&apos;s own mail server, set up by IT. Results emails are sent from this address and patients&apos;
            replies are read from it every few minutes. Passwords are stored encrypted and never shown again.
          </p>
        </div>
        <ActionButton variant="quiet" size="sm" className="ms-auto" onClick={onClose}>Close</ActionButton>
      </div>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Clinic email address">
            <TextInput type="email" required value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Name patients see">
            <TextInput value={form.display_name} onChange={set("display_name")} placeholder="V-Clinic" />
          </Field>
          <span className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2">
            <Switch checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} label="Use this mailbox" />
            In use
          </span>
        </div>
        {server("smtp", "Sending (SMTP)", "Usually port 587 with STARTTLS, or 465 with SSL/TLS.")}
        {server("imap", "Receiving (IMAP)", "Usually port 993 with SSL/TLS.")}
        <Field label="Folder to read" className="max-w-[280px]">
          <TextInput value={form.imap_folder} onChange={set("imap_folder")} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</ActionButton>
          <ActionButton variant="quiet" disabled={busy || !mailbox?.smtp_host} onClick={() => void test()}>
            Test connection
          </ActionButton>
          {check ? (
            <span className="text-[13px]">
              Sending: <strong className={check.smtp === "ok" ? "text-ok-ink" : "text-danger-ink"}>{check.smtp}</strong>
              {" · "}
              Receiving: <strong className={check.imap === "ok" ? "text-ok-ink" : "text-danger-ink"}>{check.imap}</strong>
            </span>
          ) : null}
        </div>
        <Notice notice={notice} />
      </form>
    </Panel>
  );
}
