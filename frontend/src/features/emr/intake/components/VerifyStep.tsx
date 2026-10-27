"use client";

import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/emr/errors";
import { patientFormApi, type LinkOpened } from "@/lib/api/emr/intake";
import { Icon } from "../../ui/icons";
import { formMinutes, monthNames } from "../data";
import { dateOfBirthIso, visitText } from "../logic";
import { Notice, ScreenBody, ScreenFooter, ScreenHeader } from "./Screen";
import { phoneInputClass } from "./controls";

interface VerifyStepProps {
  token: string;
  opened: LinkOpened;
  /** Shown when the session ended mid-form. */
  notice?: string;
  onVerified: (session: string) => void;
  /** The link stopped working (LINK_INVALID / LINK_LOCKED). */
  onGone: (error: ApiError) => void;
}

/** Opening screen: who the form is for, then the date of birth as the only identity check. */
export function VerifyStep({ token, opened, notice, onVerified, onGone }: VerifyStepProps) {
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visit = visitText(opened.visit_at);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const dob = dateOfBirthIso(day, month, year);
    if (!dob) {
      setError("Enter your full date of birth: day, month and year.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { session } = await patientFormApi.verify(token, dob);
      onVerified(session);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 410) {
        onGone(err);
        return;
      }
      setError(err instanceof ApiError && err.code === "DATE_OF_BIRTH_MISMATCH"
        ? "That date of birth does not match our records. Please check it and try again. After 5 wrong tries the link locks for your safety."
        : apiErrorMessage(err, "We could not check your date of birth. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
      <ScreenHeader clinic={opened.clinic_name} />
      <ScreenBody className="gap-6">
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[28px] font-bold leading-[1.35]">Hello, {opened.first_name}</h1>
          <p className="m-0 text-base leading-[1.7] text-ink-3">
            {visit ? (
              <>This is the form for your visit on <strong className="text-ink">{visit}</strong>. </>
            ) : (
              <>This is your {opened.kind === "followup" ? "follow-up " : ""}form from {opened.clinic_name}. </>
            )}
            It takes {formMinutes[opened.kind]}, and you can save and finish later.
          </p>
        </div>
        {notice ? <Notice tone="info">{notice}</Notice> : null}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-semibold">Your date of birth</legend>
          <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              Day
              <input
                inputMode="numeric"
                autoComplete="bday-day"
                maxLength={2}
                placeholder="DD"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))}
                className={phoneInputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              Month
              <select
                autoComplete="bday-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={phoneInputClass}
              >
                <option value="">Month</option>
                {monthNames.map((name, i) => (
                  <option key={name} value={String(i + 1)}>{name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              Year
              <input
                inputMode="numeric"
                autoComplete="bday-year"
                maxLength={4}
                placeholder="YYYY"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                className={phoneInputClass}
              />
            </label>
          </div>
        </fieldset>
        {error ? <Notice>{error}</Notice> : null}
        <div className="mt-auto flex items-start gap-2.5 rounded-2xl bg-brand-tint p-3.5 text-[13px] leading-[1.7] text-brand-deep">
          <Icon name="lock" size={18} className="mt-0.5 flex-none" />
          This link is for you only. After you confirm your date of birth you will see only your own form.
        </div>
      </ScreenBody>
      <ScreenFooter primary={{ label: busy ? "Checking…" : "Start the form", type: "submit", busy }} />
    </form>
  );
}
