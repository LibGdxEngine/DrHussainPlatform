"use client";

import { useState } from "react";
import { contentApi, type AlertRule } from "@/lib/api/emr/content";
import { settingsError } from "../../settings/errors";
import { ActionButton } from "../../ui/Action";
import { TextInput } from "../../ui/Fields";
import { addMedicineTerm, MAX_MEDICINE_TERM_LENGTH, MAX_MEDICINE_TERMS, sameTerms } from "../data";

interface MedicineTermsEditorProps {
  rule: AlertRule;
  /** The rule as saved, with its new version. */
  onSaved: (rule: AlertRule) => void;
}

/** The medicine names a rule looks for, edited and saved on their own as the rule's next version. */
export function MedicineTermsEditor({ rule, onSaved }: MedicineTermsEditorProps) {
  const saved = rule.medicine_terms ?? [];
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<string[]>(saved);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = !sameTerms(terms, saved);

  function add() {
    const next = addMedicineTerm(terms, typed);
    setError(next.error);
    if (!next.error) {
      setTerms(next.terms);
      setTyped("");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await contentApi.alertRules.update(rule.id, { medicine_terms: terms, note: "Medicine names changed" });
      onSaved(next);
      setTerms(next.medicine_terms ?? []);
      setOpen(false);
    } catch (err) {
      setError(settingsError(err, "Could not save the medicine names."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
        Medicine names: {saved.length ? saved.join(", ") : "none yet"}
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-brand underline"
          onClick={() => {
            setTerms(saved);
            setError(null);
            setOpen(true);
          }}
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-line p-2 text-[12px]">
      <span className="text-[11px] text-muted">
        Medicine names this rule looks for, matched without case or punctuation (at most {MAX_MEDICINE_TERMS}).
      </span>
      <div className="flex flex-wrap gap-1">
        {terms.map((term) => (
          <span key={term} className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5">
            {term}
            <button
              type="button"
              aria-label={`Remove ${term}`}
              className="cursor-pointer border-0 bg-transparent p-0 text-muted hover:text-danger-ink"
              onClick={() => setTerms((t) => t.filter((x) => x !== term))}
            >
              ×
            </button>
          </span>
        ))}
        {!terms.length ? <span className="text-muted">No names: the rule has nothing to match.</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TextInput
          className="min-h-8 w-44 text-[12px]"
          maxLength={MAX_MEDICINE_TERM_LENGTH}
          aria-label={`Add a medicine name to ${rule.code}`}
          placeholder="Add a name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <ActionButton variant="quiet" size="sm" onClick={add}>Add</ActionButton>
        <ActionButton size="sm" disabled={busy || !changed} onClick={() => void save()}>
          {busy ? "Saving…" : "Save names"}
        </ActionButton>
        <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</ActionButton>
      </div>
      {error ? <span role="alert" className="text-[11px] text-danger-ink">{error}</span> : null}
    </div>
  );
}
