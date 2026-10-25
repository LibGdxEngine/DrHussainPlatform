"use client";

import { useState } from "react";
import { contactChannels, type ContactChannel } from "@/features/emr/journey/data";
import { emrRoutes } from "@/features/emr/routes";
import { ActionLink } from "@/features/emr/ui/Action";
import { ChipGroup } from "@/features/emr/ui/ChipGroup";
import { Field, SelectInput, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";

export function NewPatientForm() {
  const [channel, setChannel] = useState<ContactChannel>("whatsapp");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  return (
    <Panel aria-labelledby="np" className="flex flex-col gap-3.5 p-[22px]">
      <h2 id="np" className="m-0 text-[19px] font-semibold">
        New patient
      </h2>
      <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
        First contact via
        <ChipGroup label="First contact via" options={contactChannels} value={channel} onChange={setChannel} />
      </div>
      <Field label="Full name">
        <TextInput />
      </Field>
      <Field label="Date of birth">
        <TextInput placeholder="DD / MM / YYYY" />
      </Field>
      <Field label="Mobile">
        <TextInput placeholder="+20" value={mobile} onChange={(e) => setMobile(e.target.value)} />
      </Field>
      <Field label="WhatsApp number">
        <TextInput
          placeholder={mobile || "Same as mobile"}
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </Field>
      <Field label="Email">
        <TextInput />
      </Field>
      <Field label="Form language">
        <SelectInput defaultValue="en">
          <option value="ar">Arabic</option>
          <option value="en">English</option>
        </SelectInput>
      </Field>
      <Field label="Referring doctor (optional)">
        <TextInput />
      </Field>
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
        The file number is created automatically. The system will warn you if a similar name and date of birth are
        already registered. The full medical history is taken at Visit 1.
      </p>
      <ActionLink href={emrRoutes.appts} className="min-h-12">
        Save and book Visit 1
      </ActionLink>
    </Panel>
  );
}
