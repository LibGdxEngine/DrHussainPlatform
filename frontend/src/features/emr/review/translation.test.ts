import { describe, expect, it } from "vitest";
import type { EmailTemplate } from "@/lib/api/emr/content";
import type { TranslationSource } from "@/lib/api/emr/review";
import {
  emptyTranslation, placeholderNames, placeholdersMatch, translationBlock, translationRequest, translationStale,
} from "./translation";

const source = (overrides: Partial<TranslationSource> = {}): TranslationSource => ({
  key: "results_normal",
  name: "Normal results",
  is_phrase: false,
  subject: "Results for {{patient.first_name}}",
  body: "Dear {{patient.first_name}},\n{{results.table}}",
  english_version: 3,
  placeholders: ["patient.first_name", "results.table"],
  suggestion: null,
  ...overrides,
});

describe("placeholderNames", () => {
  it("reads names with or without spaces inside the braces, like the server", () => {
    expect([...placeholderNames("A {{ a.b }} and {{c}} and {{c}}")]).toEqual(["a.b", "c"]);
    expect(placeholderNames("no placeholders").size).toBe(0);
  });
});

describe("placeholdersMatch", () => {
  it("accepts the same set across subject and body, in any order", () => {
    expect(placeholdersMatch(["a", "b"], "{{b}}", "x {{a}} y {{ b }}")).toEqual({ ok: true, missing: [], extra: [] });
  });

  it("lists placeholders that were dropped or added", () => {
    expect(placeholdersMatch(["a", "b"], "", "{{a}} {{zz}}")).toEqual({ ok: false, missing: ["b"], extra: ["zz"] });
  });

  it("treats no placeholders on both sides as a match", () => {
    expect(placeholdersMatch([], "", "plain").ok).toBe(true);
    expect(placeholdersMatch([], "", "{{x}}").extra).toEqual(["x"]);
  });
});

describe("translationBlock", () => {
  it("asks for the body, then the subject when the English has one, then matching placeholders", () => {
    const s = source();
    expect(translationBlock(s, emptyTranslation)).toBe("Type the translation first.");
    expect(translationBlock(s, { ...emptyTranslation, body: "x {{patient.first_name}} {{results.table}}" })).toBe(
      "Translate the subject too.",
    );
    expect(translationBlock(s, { subject: "s", body: "x", keepForFuture: false })).toBe(
      "Keep exactly the placeholders of the English wording.",
    );
    expect(
      translationBlock(s, { subject: "s {{patient.first_name}}", body: "b {{results.table}}", keepForFuture: false }),
    ).toBeNull();
  });

  it("does not ask for a subject when the English part has none (phrases)", () => {
    const phrase = source({ key: "phrase.signature", is_phrase: true, subject: "", body: "Sig", placeholders: [] });
    expect(translationBlock(phrase, { subject: "", body: "fake", keepForFuture: false })).toBeNull();
  });
});

describe("translationRequest", () => {
  it("sends the key, the explicit keep choice, and no subject for a part without one", () => {
    const phrase = source({ key: "phrase.default_subject", subject: "", body: "x", placeholders: [] });
    expect(translationRequest(phrase, { subject: "ignored", body: "fake", keepForFuture: true })).toEqual({
      key: "phrase.default_subject", subject: "", body: "fake", keep_for_future: true,
    });
    expect(translationRequest(source(), { subject: "s", body: "b", keepForFuture: false }).keep_for_future).toBe(false);
  });
});

describe("translationStale", () => {
  const version = (id: string, approvedAt: string, translatedFrom: string | null = null) =>
    ({ id, approved_at: approvedAt, translated_from: translatedFrom }) as EmailTemplate["approved"];
  const tpl = (approved: EmailTemplate["approved"]) => ({ approved }) as Pick<EmailTemplate, "approved">;

  it("compares translated_from with the current approved English version", () => {
    expect(translationStale(tpl(version("ar1", "2026-01-02", "en1")), tpl(version("en1", "2026-01-01")))).toBe(false);
    expect(translationStale(tpl(version("ar1", "2026-01-02", "en1")), tpl(version("en2", "2026-01-03")))).toBe(true);
  });

  it("falls back to approval order for a translation with no source link", () => {
    expect(translationStale(tpl(version("ar1", "2026-01-05")), tpl(version("en1", "2026-01-01")))).toBe(false);
    expect(translationStale(tpl(version("ar1", "2026-01-01")), tpl(version("en1", "2026-01-05")))).toBe(true);
  });

  it("is never stale without both approved versions", () => {
    expect(translationStale(tpl(null), tpl(version("en1", "2026-01-01")))).toBe(false);
    expect(translationStale(tpl(version("ar1", "2026-01-01")), undefined)).toBe(false);
  });
});
