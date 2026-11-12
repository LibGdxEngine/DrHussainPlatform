import type { Draft, DraftOptions, ResultsCaseDetail } from "@/lib/api/emr/review";

/** Template keys of the per-infection parts of an STI email; each takes its own prescription. */
export const STI_SECTION = "sti_section_";

export interface DraftSection {
  key: string;
  name: string;
}

/** The positive-result sections this draft was built from, in the email's order. */
export function positiveSections(draft: Pick<Draft, "template_versions">): DraftSection[] {
  const seen = new Set<string>();
  const sections: DraftSection[] = [];
  for (const t of draft.template_versions) {
    if (!t.key.startsWith(STI_SECTION) || seen.has(t.key)) continue;
    seen.add(t.key);
    sections.push({ key: t.key, name: t.name || t.key.slice(STI_SECTION.length).replaceAll("_", " ") });
  }
  return sections;
}

export type SectionPicks = Record<string, string[]>;

/** {section key: [prescription item ids]} as saved on the draft, with every positive section present. */
export function savedSectionPicks(draft: Pick<Draft, "template_versions" | "section_prescriptions">): SectionPicks {
  const picks: SectionPicks = {};
  for (const s of positiveSections(draft)) picks[s.key] = [];
  for (const row of draft.section_prescriptions) {
    if (!picks[row.section_key]) continue;
    if (!picks[row.section_key].includes(row.item)) picks[row.section_key].push(row.item);
  }
  return picks;
}

const sameSet = (a: string[], b: string[]) => a.slice().sort().join() === b.slice().sort().join();

export function sectionPicksChanged(saved: SectionPicks, picks: SectionPicks): boolean {
  return Object.keys(saved).some((key) => !sameSet(saved[key], picks[key] ?? []));
}

export interface DraftChoices {
  /** Flat prescriptions, used when the email has no per-infection sections. */
  prescriptions: string[];
  sectionPicks: SectionPicks;
  followUp: string;
}

/**
 * The options request for these choices. An email with positive-result sections sends one list per
 * section (the server rejects a flat list there); any other email sends the flat list.
 */
export function choicesRequest(draft: Pick<Draft, "template_versions">, choices: DraftChoices): DraftOptions {
  const sections = positiveSections(draft);
  if (!sections.length) return { prescriptions: choices.prescriptions, follow_up: choices.followUp };
  const section_prescriptions: SectionPicks = {};
  for (const s of sections) section_prescriptions[s.key] = choices.sectionPicks[s.key] ?? [];
  return { section_prescriptions, follow_up: choices.followUp };
}

export interface Recipient {
  address: string;
  /** The reply thread is with someone other than the patient (e.g. a relative). */
  thirdParty: boolean;
  relation: string;
  /** The thread contact's address, offered instead of the patient's on a third-party thread. */
  threadContact: string;
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Who the email goes to, as the server decides it: a reply goes back to the sender when that is the
 * patient's own address. Anyone else (a relative, whatever the thread says) gets it only when the
 * doctor confirms the thread contact; otherwise it goes to the patient.
 */
export function recipientFor(detail: Pick<ResultsCaseDetail, "patient" | "question">, toThreadContact: boolean): Recipient {
  const q = detail.question;
  if (!q) return { address: detail.patient.email, thirdParty: false, relation: "", threadContact: "" };
  if (detail.patient.email && sameAddress(q.from_address, detail.patient.email)) {
    return { address: q.from_address, thirdParty: false, relation: "", threadContact: "" };
  }
  return {
    address: toThreadContact ? q.from_address : detail.patient.email,
    thirdParty: true,
    relation: q.third_party_relation,
    threadContact: q.from_address,
  };
}

/** Why "Approve and send" is not available yet, or null when it is. */
export function approveBlock(state: {
  dirty: boolean;
  openSlots: string[];
  missingTranslations: string[];
  recipient: string;
}): string | null {
  if (state.dirty) return "Save your edits before approving.";
  if (state.missingTranslations.length) {
    const n = state.missingTranslations.length;
    return `Translate ${n} ${n === 1 ? "part" : "parts"} into Arabic before sending.`;
  }
  if (state.openSlots.length) return "Fill in every highlighted blank before sending.";
  if (!state.recipient) return "There is no email address to send to.";
  return null;
}

/** Flags only the doctor's check of each value clears; "draft anyway" is refused while any is present. */
export const VALUE_FLAGS = ["uncertain_value", "unreadable_value"];

/** Whether "Draft anyway" can be offered for these flags (never for values still to be checked). */
export function canDraftAnyway(flags: string[]): boolean {
  return !flags.some((f) => VALUE_FLAGS.includes(f));
}

/**
 * The report's values for the check controls: an unreadable value nobody has checked yet is shown as
 * "Check this value" too, since only that check (confirm as read, or correct) releases the case.
 */
export function valuesForCheck<V extends { unreadable?: boolean; needs_check?: boolean; checked_at?: string | null }>(
  values: V[],
): V[] {
  return values.map((v) => (v.unreadable && !v.checked_at && !v.needs_check ? { ...v, needs_check: true } : v));
}
