"use client";

import { useState } from "react";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Field, SelectInput, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { visitTypes } from "../data";

type Channel = "whatsapp" | "sms" | "email";

function ChannelCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5">
      <input type="checkbox" checked={checked} onChange={onToggle} className="size-[17px] accent-brand" />
      {children}
    </label>
  );
}

const channelPrefix: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

/** "Book a visit" panel: patient, slot, visit type and form-link channels. */
export function BookingForm() {
  const [on, setOn] = useState<Record<Channel, boolean>>({ whatsapp: true, sms: false, email: true });
  const toggle = (c: Channel) => setOn((s) => ({ ...s, [c]: !s[c] }));
  const active = (Object.keys(on) as Channel[]).filter((c) => on[c]);

  return (
    <Panel aria-labelledby="bk" className="flex flex-col gap-3.5 p-5">
      <h2 id="bk" className="m-0 text-lg font-semibold">
        Book a visit
      </h2>
      <Field label="Patient">
        <TextInput defaultValue="Laila Ahmed · VC-000203 · DOB 2 Nov 1981" />
      </Field>
      <div className="rounded-[14px] bg-warn-wash px-3.5 py-3 text-[13px] leading-[1.7] text-[#5a3d00]">
        A similar name is already registered: <strong>Laila Ahmed</strong>, VC-000142, DOB 14 Mar 1974. Confirm the
        date of birth before booking.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <TextInput defaultValue="Wed 21 Oct" />
        </Field>
        <Field label="Time">
          <TextInput defaultValue="11:00" />
        </Field>
      </div>
      <Field label="Visit type">
        <SelectInput>
          {visitTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </SelectInput>
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border border-line px-3.5 py-3 text-sm">
        <legend className="px-1.5 text-[13px] font-semibold">Send the form link by</legend>
        <ChannelCheckbox checked={on.whatsapp} onToggle={() => toggle("whatsapp")}>
          WhatsApp to •••• 7730
        </ChannelCheckbox>
        <ChannelCheckbox checked={on.sms} onToggle={() => toggle("sms")}>
          SMS to •••• 7730
        </ChannelCheckbox>
        <ChannelCheckbox checked={on.email} onToggle={() => toggle("email")}>
          Email to{" "}
          <span className="font-emr-mono text-[13px]">
            l•••••@yahoo.com
          </span>
        </ChannelCheckbox>
      </fieldset>
      <div className="rounded-2xl rounded-es-sm bg-brand-tint px-3.5 py-3 text-[13px] leading-[1.8] text-brand-ink">
        <span className="text-[11px] text-ok-ink">
          Message preview{active.length ? ` · ${active.map((c) => channelPrefix[c]).join(" + ")}` : ""}
        </span>
        <br />
        V-Clinic: Please complete your form before your visit on Wednesday 21 Oct at 11:00. It takes about 10
        minutes: [secure link]
        {on.whatsapp ? (
          <>
            <br />
            If you have old test results or reports, send a photo here or by email, or bring them with you.
          </>
        ) : null}
      </div>
      <ActionLink href={emrRoutes.appts} className="min-h-[50px] w-full">
        Book and send link
      </ActionLink>
      <span className="text-xs text-muted">If the form isn&apos;t completed, an automatic reminder is sent 2 days before the visit.</span>
    </Panel>
  );
}
