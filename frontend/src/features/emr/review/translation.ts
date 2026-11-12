import type { EmailTemplate } from "@/lib/api/emr/content";
import type { TranslationSave, TranslationSource } from "@/lib/api/emr/review";

/**
 * The approved translation was made from an older English version than the approved one now, so
 * drafts treat it as missing (the server's rule: `translated_from`, or for an older version with
 * none, approved after the English).
 */
export function translationStale(
  translated: Pick<EmailTemplate, "approved">,
  english: Pick<EmailTemplate, "approved"> | undefined,
): boolean {
  const mine = translated.approved;
  const source = english?.approved;
  if (!mine || !source) return false;
  if (mine.translated_from) return mine.translated_from !== source.id;
  return (mine.approved_at ?? "") < (source.approved_at ?? "");
}

/** Same rule as the server (content/placeholders.py): `{{ name }}` with optional spaces. */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function placeholderNames(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]));
}

export interface PlaceholderCheck {
  ok: boolean;
  /** In the English wording but not in the translation. */
  missing: string[];
  /** In the translation but not in the English wording. */
  extra: string[];
}

/** The translation must keep exactly the English placeholders, across subject and body together. */
export function placeholdersMatch(expected: string[], subject: string, body: string): PlaceholderCheck {
  const given = new Set([...placeholderNames(subject), ...placeholderNames(body)]);
  const want = new Set(expected);
  const missing = [...want].filter((name) => !given.has(name)).sort();
  const extra = [...given].filter((name) => !want.has(name)).sort();
  return { ok: !missing.length && !extra.length, missing, extra };
}

/** What the doctor has typed for one part, kept while the draft is rebuilt around it. */
export interface TranslationInput {
  subject: string;
  body: string;
  keepForFuture: boolean;
}

export const emptyTranslation: TranslationInput = { subject: "", body: "", keepForFuture: false };

/** The parts of a source that need typing: a subject only when the English has one. */
export function needsSubject(source: TranslationSource): boolean {
  return Boolean(source.subject.trim());
}

/** Why the translation cannot be saved yet, or null when it can. */
export function translationBlock(source: TranslationSource, input: TranslationInput): string | null {
  if (!input.body.trim()) return "Type the translation first.";
  if (needsSubject(source) && !input.subject.trim()) return "Translate the subject too.";
  const check = placeholdersMatch(source.placeholders, needsSubject(source) ? input.subject : "", input.body);
  if (!check.ok) return "Keep exactly the placeholders of the English wording.";
  return null;
}

export function translationRequest(source: TranslationSource, input: TranslationInput): TranslationSave {
  return {
    key: source.key,
    subject: needsSubject(source) ? input.subject : "",
    body: input.body,
    keep_for_future: input.keepForFuture,
  };
}
