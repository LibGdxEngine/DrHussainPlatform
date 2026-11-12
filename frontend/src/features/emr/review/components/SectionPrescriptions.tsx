"use client";

import type { Prescription } from "@/lib/api/emr/content";
import type { DraftSection, SectionPicks } from "../draft";

interface SectionPrescriptionsProps {
  sections: DraftSection[];
  prescriptions: Prescription[];
  picks: SectionPicks;
  onChange: (picks: SectionPicks) => void;
  label: (prescription: Prescription) => string;
}

/** One prescription picker per positive result: each section of the email names only its own picks. */
export function SectionPrescriptions({ sections, prescriptions, picks, onChange, label }: SectionPrescriptionsProps) {
  const toggle = (key: string, id: string) => {
    const current = picks[key] ?? [];
    onChange({ ...picks, [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  };
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs text-muted">
        Prescription for each positive result. A section with none keeps a blank that must be filled or removed before
        sending.
      </span>
      {sections.map((section) => (
        <fieldset key={section.key} className="m-0 flex flex-col gap-1 rounded-xl border border-line-soft p-2.5">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">{section.name}</legend>
          {prescriptions.length ? (
            prescriptions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={(picks[section.key] ?? []).includes(p.id)}
                  onChange={() => toggle(section.key, p.id)}
                />
                {label(p)}
              </label>
            ))
          ) : (
            <span className="text-xs text-muted">No prescriptions in Clinic settings yet.</span>
          )}
          {!(picks[section.key] ?? []).length ? <span className="text-xs text-warn-ink">None chosen yet.</span> : null}
        </fieldset>
      ))}
    </div>
  );
}
