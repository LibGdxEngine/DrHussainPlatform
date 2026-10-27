import type { OrderCreate, OrderDelivery, OrderKind } from "@/lib/api/emr/orders";
import { ApiError } from "@/lib/api/emr/errors";

export type TestId = string;

/** The clinic's usual test names, keyed by the code saved on each requested test. */
export const testNames: Record<TestId, string> = {
  ferritin: "Ferritin", vitd: "Vitamin D", b12: "B12", tsh: "TSH", ft4: "Free T4", ft3: "Free T3",
  tpo: "TPO", dheas: "DHEA-S", cbc: "CBC", cmp: "CMP", insulin: "Fasting insulin", hba1c: "HbA1c",
  lipids: "Lipid panel", ggt: "GGT", hscrp: "hsCRP", homocys: "Homocysteine", apob: "ApoB",
  lpa: "Lp(a)", iodine: "Urinary iodine", prl: "Prolactin", rt3: "Reverse T3", e2: "Estradiol",
  prog: "Progesterone", fsh: "FSH", testo: "Total + free testosterone", shbg: "SHBG", bhcg: "β-hCG",
  tvus: "TVUS", lh: "LH", ohp: "17-OH progesterone", swab: "Vaginal swab",
  naat: "Chlamydia/gonorrhoea NAAT", hiv: "HIV", syph: "Syphilis", hep: "Hepatitis B/C", amh: "AMH",
  rubella: "Rubella immunity", semen: "Partner semen analysis",
};

export interface TestSet {
  name: string;
  ids: TestId[];
}

/** Clinic panel presets: one click adds a whole set. */
export const testSets: TestSet[] = [
  { name: "Baseline – all", ids: ["ferritin", "vitd", "b12", "tsh", "ft4", "ft3", "tpo", "dheas", "cbc", "cmp", "insulin", "hba1c", "lipids"] },
  { name: "Baseline – optional", ids: ["ggt", "hscrp", "homocys", "apob", "lpa", "iodine", "prl", "rt3"] },
  { name: "Female hormones", ids: ["e2", "prog", "fsh", "testo", "shbg"] },
  { name: "HRT monitoring", ids: ["e2", "prog", "testo", "dheas"] },
  { name: "Bleeding", ids: ["cbc", "ferritin", "tsh", "bhcg", "tvus"] },
  { name: "PCOS", ids: ["testo", "shbg", "dheas", "lh", "fsh", "prl", "tsh", "ohp", "hba1c", "insulin", "lipids"] },
  { name: "Infections / STIs", ids: ["swab", "naat", "hiv", "syph", "hep"] },
  { name: "Fertility", ids: ["fsh", "lh", "e2", "amh", "prog", "tsh", "prl", "rubella", "semen"] },
];

/** A test on the checklist; `checked` false keeps the chip visible but leaves it off the request. */
export interface TestLine {
  code: string;
  name: string;
  checked: boolean;
}

/** Adds the set's tests (ticked) after the ones already listed, keeping their order. */
export function addTests(lines: TestLine[], add: { code: string; name: string }[]): TestLine[] {
  const next = [...lines];
  for (const test of add) {
    const at = next.findIndex((l) => l.code === test.code);
    if (at === -1) next.push({ ...test, checked: true });
    else next[at] = { ...next[at], checked: true };
  }
  return next;
}

export function setTests(set: TestSet): { code: string; name: string }[] {
  return set.ids.map((code) => ({ code, name: testNames[code] ?? code }));
}

/** A slug the backend accepts as a test code, for a test typed in by name. */
export function testCode(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (slug) return slug;
  // Names with no Latin letters (e.g. Arabic) still need distinct codes.
  let hash = 0;
  for (const c of name.trim()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash ? `test_${hash.toString(36)}` : "other";
}

/** "Lab request: Baseline – all + PCOS" when whole sets are ticked, else a count. */
export function testsTitle(lines: TestLine[]): string {
  const on = new Set(lines.filter((l) => l.checked).map((l) => l.code));
  const sets = testSets.filter((s) => s.ids.every((id) => on.has(id))).map((s) => s.name);
  if (sets.length) return `Lab request: ${sets.join(" + ")}`;
  return `Lab request: ${on.size} ${on.size === 1 ? "test" : "tests"}`;
}

/** How a request or prescription leaves the clinic, as the doctor sees it. */
export type DeliveryChoice = "email_lab" | "email_patient" | "print" | "in_clinic";

export const testDeliveries: { id: DeliveryChoice; label: string }[] = [
  { id: "email_lab", label: "Email to the lab" },
  { id: "email_patient", label: "Email to the patient" },
  { id: "print", label: "Print and give to the patient" },
  { id: "in_clinic", label: "Done in clinic (e.g. swabs)" },
];

export const rxDeliveries: { id: DeliveryChoice; label: string }[] = [
  { id: "print", label: "Print and give to the patient" },
  { id: "email_patient", label: "Email to the patient" },
];

export const deliveryLabel: Record<OrderDelivery, string> = {
  email: "Emailed",
  print: "Printed",
  in_clinic: "Done in clinic",
};

export interface MedicineLine {
  /** Catalog item id; null for a medicine typed in by hand. */
  prescription_item: string | null;
  drug: string;
  dose: string;
  directions: string;
}

interface OrderDraft {
  patient: string;
  kind: OrderKind;
  delivery: DeliveryChoice;
  labEmail?: string;
  title: string;
  notes?: string;
  tests?: TestLine[];
  medicines?: MedicineLine[];
}

/** The request body for one order. Email to the patient leaves `sent_to` blank (the server uses theirs). */
export function orderBody(draft: OrderDraft): OrderCreate {
  const body: OrderCreate = {
    patient: draft.patient,
    kind: draft.kind,
    title: draft.title.trim(),
    delivery: draft.delivery === "email_lab" || draft.delivery === "email_patient" ? "email" : draft.delivery,
    notes: draft.notes?.trim() ?? "",
  };
  if (draft.delivery === "email_lab") body.sent_to = draft.labEmail?.trim() ?? "";
  if (draft.kind === "tests") {
    body.tests = (draft.tests ?? []).filter((t) => t.checked).map(({ code, name }) => ({ code, name }));
  } else {
    body.medicines = (draft.medicines ?? []).map((m) => ({
      prescription_item: m.prescription_item,
      drug: m.drug.trim(),
      dose: m.dose.trim(),
      directions: m.directions.trim(),
    }));
  }
  return body;
}

/** The server's message plus any field messages (e.g. a bad lab email address). */
export function issueErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError) || err.status === 0) return fallback;
  const details = Object.values(err.fields).flat().filter((m) => m && m !== err.message);
  const hint = err.code === "MAILBOX_NOT_READY" ? "Set up the clinic mailbox, or choose Print instead." : "";
  return [err.message, ...details, hint].filter(Boolean).join(" ");
}
