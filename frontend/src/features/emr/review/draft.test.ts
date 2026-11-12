import { describe, expect, it } from "vitest";
import type { Draft, ResultsCaseDetail } from "@/lib/api/emr/review";
import {
  approveBlock, canDraftAnyway, choicesRequest, positiveSections, recipientFor, savedSectionPicks, sectionPicksChanged,
  valuesForCheck,
} from "./draft";
import { actionLabel, caseFlag } from "./labels";

type DraftParts = Pick<Draft, "template_versions" | "section_prescriptions">;

const t = (key: string, name = key) => ({ key, name, language: "en", number: 1 });
const row = (section_key: string, item: string) => ({ section_key, item, number: 1, drug: "Drug", dose: "", directions: "" });

const sti: DraftParts = {
  template_versions: [
    t("sti_opening", "Opening"),
    t("sti_section_candida", "Candida"),
    t("sti_section_bacterial_vaginosis", "BV"),
    t("phrase.signature", "Signature"),
    t("sti_closing", "Closing"),
  ],
  section_prescriptions: [row("sti_section_candida", "rx1"), row("sti_section_candida", "rx1"), row("sti_other", "rx9")],
};

describe("positiveSections", () => {
  it("lists only the sti_section_ parts, once each, in the email's order", () => {
    expect(positiveSections(sti)).toEqual([
      { key: "sti_section_candida", name: "Candida" },
      { key: "sti_section_bacterial_vaginosis", name: "BV" },
    ]);
    expect(positiveSections({ template_versions: [t("results_normal")] })).toEqual([]);
  });
});

describe("section picks", () => {
  it("starts every positive section from its saved picks, ignoring rows for other sections", () => {
    expect(savedSectionPicks(sti)).toEqual({ sti_section_candida: ["rx1"], sti_section_bacterial_vaginosis: [] });
  });

  it("notices a change in any section regardless of order", () => {
    const saved = { a: ["1", "2"], b: [] };
    expect(sectionPicksChanged(saved, { a: ["2", "1"], b: [] })).toBe(false);
    expect(sectionPicksChanged(saved, { a: ["1", "2"], b: ["3"] })).toBe(true);
    expect(sectionPicksChanged(saved, { a: ["1"] })).toBe(true);
  });
});

describe("choicesRequest", () => {
  it("sends one list per positive section and never a flat list for an STI email", () => {
    const body = choicesRequest(sti, {
      prescriptions: ["flat"],
      sectionPicks: { sti_section_candida: ["rx1"], stale_key: ["rx2"] },
      followUp: "Repeat test",
    });
    expect(body).toEqual({
      section_prescriptions: { sti_section_candida: ["rx1"], sti_section_bacterial_vaginosis: [] },
      follow_up: "Repeat test",
    });
    expect("prescriptions" in body).toBe(false);
  });

  it("sends the flat list for other emails", () => {
    expect(choicesRequest({ template_versions: [t("results_normal")] }, { prescriptions: ["a"], sectionPicks: {}, followUp: "" }))
      .toEqual({ prescriptions: ["a"], follow_up: "" });
  });
});

describe("recipientFor", () => {
  const patient = { id: "p", file_number: "1", full_name: "P", email: "patient@example.com", preferred_language: "en" };
  const question = (third_party: boolean) => ({
    id: "q", thread: "t", from_address: "writer@example.com", subject: "", body_text: "", sent_at: "",
    third_party, third_party_relation: third_party ? "Sister" : "",
  });
  const detail = (q: ReturnType<typeof question> | null) => ({ patient, question: q }) as Pick<ResultsCaseDetail, "patient" | "question">;

  it("sends results to the patient and a reply back to the patient's own address", () => {
    expect(recipientFor(detail(null), false).address).toBe("patient@example.com");
    const own = { ...question(false), from_address: "Patient@Example.com " };
    expect(recipientFor(detail(own), true)).toMatchObject({ address: "Patient@Example.com ", thirdParty: false });
  });

  it("treats any other sender as a third party even when the thread is not marked", () => {
    expect(recipientFor(detail(question(false)), false)).toEqual({
      address: "patient@example.com", thirdParty: true, relation: "", threadContact: "writer@example.com",
    });
    expect(recipientFor(detail(question(false)), true).address).toBe("writer@example.com");
  });

  it("sends a third-party reply to the patient unless the thread contact is confirmed", () => {
    expect(recipientFor(detail(question(true)), false)).toEqual({
      address: "patient@example.com", thirdParty: true, relation: "Sister", threadContact: "writer@example.com",
    });
    expect(recipientFor(detail(question(true)), true).address).toBe("writer@example.com");
  });
});

describe("approveBlock", () => {
  const ok = { dirty: false, openSlots: [], missingTranslations: [], recipient: "a@example.com" };

  it("allows approving a clean, complete draft", () => {
    expect(approveBlock(ok)).toBeNull();
  });

  it("blocks while parts still need translating, even if no blank is left", () => {
    expect(approveBlock({ ...ok, missingTranslations: ["phrase.signature"] })).toBe("Translate 1 part into Arabic before sending.");
    expect(approveBlock({ ...ok, missingTranslations: ["a", "b"], openSlots: ["Translate: A"] })).toBe(
      "Translate 2 parts into Arabic before sending.",
    );
  });

  it("gives the other reasons in order", () => {
    expect(approveBlock({ ...ok, dirty: true, missingTranslations: ["a"] })).toBe("Save your edits before approving.");
    expect(approveBlock({ ...ok, openSlots: ["prescription"] })).toBe("Fill in every highlighted blank before sending.");
    expect(approveBlock({ ...ok, recipient: "" })).toBe("There is no email address to send to.");
  });
});

describe("case flag labels", () => {
  it("names each new flag in words, not as a rule code", () => {
    for (const code of ["uncertain_value", "red_alert_open", "alert_rules_not_checked", "phrase_not_approved", "peanut_allergy_prometrium"]) {
      const text = caseFlag(code);
      expect(text).not.toContain(code);
      expect(text).not.toContain("_");
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("keeps red_alert_open apart from a fired rule's red_alert_<code>", () => {
    expect(caseFlag("red_alert_open")).not.toMatch(/rule open/);
    expect(caseFlag("red_alert_R34")).toMatch(/Red alert rule R34 fired/);
  });

  it("labels the Arabic translation action", () => {
    expect(actionLabel.arabic_drafted).toBe("Arabic wording saved");
  });
});

describe("canDraftAnyway", () => {
  it("is never offered while a value is uncertain or unreadable", () => {
    expect(canDraftAnyway(["red_alert_open", "alert_rules_not_checked"])).toBe(true);
    expect(canDraftAnyway(["uncertain_value"])).toBe(false);
    expect(canDraftAnyway(["red_alert_open", "unreadable_value"])).toBe(false);
  });
});

describe("valuesForCheck", () => {
  it("offers the check on an unreadable value nobody has checked", () => {
    const [unread, checked, plain] = valuesForCheck([
      { unreadable: true, needs_check: false, checked_at: null },
      { unreadable: true, needs_check: false, checked_at: "2026-11-11T10:00:00Z" },
      { unreadable: false, needs_check: false, checked_at: null },
    ]);
    expect([unread.needs_check, checked.needs_check, plain.needs_check]).toEqual([true, false, false]);
  });
});
