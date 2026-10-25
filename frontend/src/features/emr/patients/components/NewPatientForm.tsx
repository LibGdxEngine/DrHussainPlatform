"use client";

import Link from "next/link";
import { useState } from "react";
import { contactChannels, type ContactChannel } from "@/features/emr/journey/data";
import { formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton, ActionLink } from "@/features/emr/ui/Action";
import { ChipGroup } from "@/features/emr/ui/ChipGroup";
import { Field, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { ApiError } from "@/lib/api/emr/errors";
import { patientsApi, type Patient, type SimilarPatient } from "@/lib/api/emr/patients";

const emptyForm = { full_name: "", date_of_birth: "", mobile: "", whatsapp: "", email: "", referring_doctor: "" };
type FormFields = typeof emptyForm;

interface NewPatientFormProps {
  onCreated: (patient: Patient) => void;
}

export function NewPatientForm({ onCreated }: NewPatientFormProps) {
  const [channel, setChannel] = useState<ContactChannel>("whatsapp");
  const [form, setForm] = useState<FormFields>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [similar, setSimilar] = useState<SimilarPatient[] | null>(null);
  const [created, setCreated] = useState<Patient | null>(null);

  const set = (key: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setSimilar(null);
  };

  async function save(confirmDuplicate = false) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const patient = await patientsApi.create({
        ...form,
        whatsapp: form.whatsapp || form.mobile,
        first_contact_channel: channel,
        confirm_duplicate: confirmDuplicate,
      });
      setCreated(patient);
      setSimilar(null);
      setForm(emptyForm);
      onCreated(patient);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_PATIENT") {
        setSimilar((err.context?.similar as SimilarPatient[] | undefined) ?? []);
      } else if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError("Could not save the patient.");
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) =>
    fieldErrors[key]?.length ? <span className="text-xs font-normal text-danger-ink">{fieldErrors[key][0]}</span> : null;

  return (
    <Panel aria-labelledby="np" className="flex flex-col gap-3.5 p-[22px]">
      <h2 id="np" className="m-0 text-[19px] font-semibold">
        New patient
      </h2>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          First contact via
          <ChipGroup label="First contact via" options={contactChannels} value={channel} onChange={setChannel} />
        </div>
        <Field label="Full name">
          <TextInput required value={form.full_name} onChange={set("full_name")} />
          {fieldError("full_name")}
        </Field>
        <Field label="Date of birth">
          <TextInput type="date" required value={form.date_of_birth} onChange={set("date_of_birth")} />
          {fieldError("date_of_birth")}
        </Field>
        <Field label="Mobile">
          <TextInput placeholder="+20" type="tel" value={form.mobile} onChange={set("mobile")} />
        </Field>
        <Field label="WhatsApp number">
          <TextInput type="tel" placeholder={form.mobile || "Same as mobile"} value={form.whatsapp} onChange={set("whatsapp")} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={form.email} onChange={set("email")} />
          {fieldError("email")}
        </Field>
        <Field label="Referring doctor (optional)">
          <TextInput value={form.referring_doctor} onChange={set("referring_doctor")} />
        </Field>

        {similar ? (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warn-wash px-3 py-2.5 text-xs leading-[1.7] text-warn-ink">
            <strong className="font-semibold">Already registered with the same name and date of birth:</strong>
            <ul className="m-0 ps-4">
              {similar.map((p) => (
                <li key={p.id}>
                  <Link href={`${emrRoutes.docs}?patient=${encodeURIComponent(p.file_number)}`} className="text-warn-ink">
                    {p.full_name} · {p.file_number} · born {formatDay(p.date_of_birth)}
                  </Link>
                </li>
              ))}
            </ul>
            <ActionButton variant="quiet" size="sm" className="self-start" disabled={busy} onClick={() => void save(true)}>
              It&apos;s a different person: create a new file
            </ActionButton>
          </div>
        ) : null}
        {error ? <p role="alert" className="m-0 text-xs text-danger-ink">{error}</p> : null}

        <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">
          The file number is created automatically. The system will warn you if a similar name and date of birth are
          already registered. The full medical history is taken at Visit 1.
        </p>
        <ActionButton type="submit" className="min-h-12" disabled={busy}>
          {busy ? "Saving…" : "Save patient"}
        </ActionButton>
      </form>

      {created ? (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-ok-tint px-3 py-2.5 text-[13px] text-ok-ink">
          <span>
            Saved <strong>{created.full_name}</strong> as{" "}
            <span className="font-emr-mono">{created.file_number}</span>.
          </span>
          <div className="flex flex-wrap gap-2">
            <ActionLink href={`${emrRoutes.docs}?patient=${encodeURIComponent(created.file_number)}`} size="sm">
              Open documents
            </ActionLink>
            <ActionLink href={emrRoutes.appts} variant="quiet" size="sm">
              Book Visit 1
            </ActionLink>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
