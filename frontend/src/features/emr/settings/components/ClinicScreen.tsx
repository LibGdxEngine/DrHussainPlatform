"use client";

import { useEffect, useState } from "react";
import { contentApi, type ClinicProfile } from "@/lib/api/emr/content";
import { ActionButton } from "../../ui/Action";
import { Field, TextArea, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { settingsError } from "../errors";
import { Notice, type NoticeState } from "./Notice";
import { SettingsHeader } from "./SettingsHeader";

type Form = Pick<ClinicProfile, "display_name" | "phone" | "doctor_name" | "signature">;

/** Details quoted in emails: {{clinic.name}}, {{clinic.phone}} and {{doctor.name}}. */
export function ClinicScreen() {
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => {
    let cancelled = false;
    contentApi.profile.get().then(
      (p) => !cancelled && setForm({ display_name: p.display_name, phone: p.phone, doctor_name: p.doctor_name, signature: p.signature }),
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the clinic details.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await contentApi.profile.update(form);
      setForm({ display_name: saved.display_name, phone: saved.phone, doctor_name: saved.doctor_name, signature: saved.signature });
      setNotice({ tone: "ok", text: "Clinic details saved." });
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not save the clinic details.") });
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));

  return (
    <>
      <SettingsHeader
        tab="clinic"
        title="Clinic details"
        description="Patients phone the clinic to book, so the phone number here is what results emails tell them to call."
      />
      <Notice notice={notice} />
      <Panel className="max-w-[640px] p-6">
        {form ? (
          <form className="flex flex-col gap-3.5" onSubmit={save}>
            <Field label="Clinic name in emails">
              <TextInput value={form.display_name ?? ""} onChange={set("display_name")} />
            </Field>
            <Field label="Phone number for booking">
              <TextInput type="tel" value={form.phone ?? ""} onChange={set("phone")} />
            </Field>
            <Field label="Doctor's name">
              <TextInput value={form.doctor_name ?? ""} onChange={set("doctor_name")} />
            </Field>
            <Field label="Signature under every email">
              <TextArea rows={4} value={form.signature ?? ""} onChange={set("signature")} dir="auto" />
            </Field>
            <ActionButton type="submit" disabled={busy} className="self-start">{busy ? "Saving…" : "Save"}</ActionButton>
          </form>
        ) : (
          <p className="m-0 text-[13px] text-muted">Loading…</p>
        )}
      </Panel>
    </>
  );
}
