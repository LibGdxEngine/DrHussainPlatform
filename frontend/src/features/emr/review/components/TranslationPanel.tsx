"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { reviewApi, type ResultsCaseDetail, type TranslationSource } from "@/lib/api/emr/review";
import { ActionButton } from "../../ui/Action";
import { Field, TextArea, TextInput } from "../../ui/Fields";
import { Pill } from "../../ui/Pill";
import {
  emptyTranslation, needsSubject, placeholdersMatch, translationBlock, translationRequest, type TranslationInput,
} from "../translation";
import { reviewError } from "./reviewError";

interface TranslationPanelProps {
  caseId: string;
  /** Keys still in English (Draft.missing_translations); the list reloads when it changes. */
  missing: string[];
  inputs: Record<string, TranslationInput>;
  onInput: (key: string, input: TranslationInput) => void;
  busy: boolean;
  /** The case after a translation was saved and the draft rebuilt with it. */
  onSaved: (detail: ResultsCaseDetail, key: string, done: string) => void;
}

/**
 * The parts of an Arabic draft still in English, each beside its English source. The doctor types
 * the translation; it is used for this case, and kept for future emails only when ticked.
 */
export function TranslationPanel({ caseId, missing, inputs, onInput, busy, onSaved }: TranslationPanelProps) {
  const [loaded, setLoaded] = useState<{ sources?: TranslationSource[]; error?: string } | null>(null);
  const [reloads, setReloads] = useState(0);
  const missingKey = missing.join("|");

  useEffect(() => {
    let cancelled = false;
    reviewApi.translations(caseId).then(
      (sources) => !cancelled && setLoaded({ sources }),
      (err: unknown) => !cancelled && setLoaded({ error: reviewError(err, "Could not load the parts to translate.") }),
    );
    return () => {
      cancelled = true;
    };
  }, [caseId, missingKey, reloads]);

  return (
    <section aria-label="Parts to translate" className="flex flex-col gap-3 rounded-2xl border border-warn-line bg-warn-wash p-3.5">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-semibold text-warn-ink">
          Translate into Arabic before sending ({missing.length} {missing.length === 1 ? "part" : "parts"})
        </h3>
        <p className="m-0 text-xs leading-[1.7] text-warn-ink">
          These parts have no current Arabic wording, so the draft shows them in English. Each translation must keep the
          same {"{{placeholders}}"} as the English. System phrases are short pieces of wording used inside emails.
        </p>
      </div>
      {loaded?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger-ink">
          {loaded.error}
          <ActionButton variant="quiet" size="sm" onClick={() => setReloads((n) => n + 1)}>Try again</ActionButton>
        </div>
      ) : null}
      {!loaded ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
      {loaded?.sources && !loaded.sources.length ? (
        <p className="m-0 text-[13px] text-warn-ink">
          The listed parts have no approved English wording to translate. Approve the English first (Clinic settings →
          Email templates).
        </p>
      ) : null}
      {loaded?.sources?.map((source) => (
        <TranslationCard
          key={source.key}
          caseId={caseId}
          source={source}
          input={inputs[source.key] ?? emptyTranslation}
          onInput={(input) => onInput(source.key, input)}
          busy={busy}
          onSaved={onSaved}
        />
      ))}
    </section>
  );
}

interface TranslationCardProps {
  caseId: string;
  source: TranslationSource;
  input: TranslationInput;
  onInput: (input: TranslationInput) => void;
  busy: boolean;
  onSaved: TranslationPanelProps["onSaved"];
}

function TranslationCard({ caseId, source, input, onInput, busy, onSaved }: TranslationCardProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withSubject = needsSubject(source);
  const check = placeholdersMatch(source.placeholders, withSubject ? input.subject : "", input.body);
  const typed = Boolean(input.body.trim() || input.subject.trim());
  const block = translationBlock(source, input);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await reviewApi.saveTranslation(caseId, translationRequest(source, input));
      onSaved(
        next,
        source.key,
        input.keepForFuture
          ? `${source.name}: saved and kept for future Arabic emails.`
          : `${source.name}: saved for this email only.`,
      );
    } catch (err) {
      setError(reviewError(err, "Could not save the translation."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13px] font-semibold">{source.name}</strong>
        <Pill tone={source.is_phrase ? "brand" : "neutral"} size="xs">{source.is_phrase ? "System phrase" : "Template part"}</Pill>
        {source.english_version ? (
          <span className="text-xs text-muted">From English v{source.english_version}</span>
        ) : (
          <span className="text-xs text-muted">From the clinic profile</span>
        )}
      </div>
      {source.placeholders.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Placeholders to keep:
          {source.placeholders.map((name) => (
            <code
              key={name}
              className={cn(
                "rounded-full border px-2 py-0.5 font-emr-mono text-[11px]",
                typed && check.missing.includes(name) ? "border-warn-line bg-warn-wash text-warn-ink" : "border-line bg-canvas text-ink-3",
              )}
            >
              {`{{${name}}}`}
            </code>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted">No placeholders: the translation must not add any.</span>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">English</span>
          {withSubject ? (
            <p className="m-0 rounded-lg bg-canvas-2 px-3 py-2 text-[13px] font-semibold" dir="ltr">{source.subject}</p>
          ) : null}
          <p className="m-0 whitespace-pre-wrap rounded-lg bg-canvas-2 px-3 py-2 text-[13px] leading-[1.7] text-ink-2" dir="ltr">
            {source.body}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          {withSubject ? (
            <Field label="Arabic subject">
              <TextInput
                dir="rtl"
                lang="ar"
                value={input.subject}
                onChange={(e) => onInput({ ...input, subject: e.target.value })}
              />
            </Field>
          ) : null}
          <Field label="Arabic wording">
            <TextArea
              dir="rtl"
              lang="ar"
              rows={Math.min(12, Math.max(3, source.body.split("\n").length + 1))}
              value={input.body}
              onChange={(e) => onInput({ ...input, body: e.target.value })}
              className="text-[13px]"
            />
          </Field>
        </div>
      </div>
      {source.suggestion ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line p-2.5">
          <span className="text-xs font-semibold text-warn-ink">Suggestion, check it</span>
          {source.suggestion.subject ? (
            <p className="m-0 text-[13px] font-semibold" dir="auto">{source.suggestion.subject}</p>
          ) : null}
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.7] text-ink-2" dir="auto">{source.suggestion.body}</p>
          <ActionButton
            variant="quiet"
            size="sm"
            className="self-start"
            onClick={() =>
              onInput({ ...input, subject: source.suggestion?.subject ?? input.subject, body: source.suggestion?.body ?? input.body })
            }
          >
            Use the suggestion as a starting point
          </ActionButton>
        </div>
      ) : null}
      {typed && !check.ok ? (
        <p role="alert" className="m-0 text-xs text-warn-ink">
          {check.missing.length ? `Missing: ${check.missing.map((n) => `{{${n}}}`).join(", ")}. ` : ""}
          {check.extra.length ? `Not in the English: ${check.extra.map((n) => `{{${n}}}`).join(", ")}.` : ""}
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-1"
          checked={input.keepForFuture}
          onChange={(e) => onInput({ ...input, keepForFuture: e.target.checked })}
        />
        <span>
          Keep for future Arabic emails
          <span className="block text-xs text-muted">
            Ticked: saved as the approved Arabic version, so later Arabic drafts use it. Not ticked: used for this email
            only, and asked again next time.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton size="sm" disabled={busy || saving || Boolean(block)} onClick={() => void save()}>
          {saving ? "Saving…" : "Save translation"}
        </ActionButton>
        {block && typed ? <span className="text-xs text-muted">{block}</span> : null}
      </div>
      {error ? <p role="alert" className="m-0 text-xs text-danger-ink">{error}</p> : null}
    </div>
  );
}
