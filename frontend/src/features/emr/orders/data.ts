export type TestId = string;
export type MedId = "estriol" | "e2gel" | "prom" | "vitd";

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

/** Insertion order of this object drives the order of the checklist chips. */
export const initialTests: Record<TestId, boolean> = {
  ferritin: true, vitd: true, tsh: true, lipids: true, hba1c: true, lpa: true, tvus: true,
};

export interface Medication {
  id: MedId;
  name: string;
  sig: string;
  kind: string;
}

export const medications: Medication[] = [
  { id: "estriol", name: "Estriol 0.1% vaginal cream", sig: "0.5 g nightly for 2 weeks, then twice weekly", kind: "Vaginal · Not locked" },
  { id: "e2gel", name: "Estradiol gel 0.06%", sig: "2 pumps (1.5 mg) daily to the skin", kind: "Systemic estrogen" },
  { id: "prom", name: "Micronised progesterone 100 mg (Prometrium)", sig: "1 capsule nightly", kind: "Endometrial protection" },
  { id: "vitd", name: "Vitamin D3 2000 IU", sig: "1 daily", kind: "Supplement" },
];

export const initialMeds: Record<MedId, boolean> = { estriol: true, e2gel: true, prom: false, vitd: false };

export interface PrescriptionBlock {
  tag: string;
  title: string;
  text: string;
  action: string;
  target: "visit" | "orders";
}

/** R7 / R10 hard blocks derived from the selected medications. */
export function deriveBlocks(meds: Record<MedId, boolean>): PrescriptionBlock[] {
  const blocks: PrescriptionBlock[] = [];
  if (meds.e2gel) {
    blocks.push({
      tag: "Red · R7 · Locked",
      title: "Postmenopausal bleeding not yet confirmed",
      text: "Systemic HRT is locked until R7 is confirmed with a reason on the Summary page.",
      action: "Go to alert",
      target: "visit",
    });
  }
  if (meds.e2gel && !meds.prom) {
    blocks.push({
      tag: "Red · R10 · Locked",
      title: "Uterus present: systemic estrogen without progesterone or LNG-IUS",
      text: "Add endometrial protection, such as micronised progesterone.",
      action: "Add progesterone",
      target: "orders",
    });
  }
  return blocks;
}

export const sentLog = [
  { title: "Lab request: Baseline – all + hormones", detail: "Emailed to the lab · 11 Oct 2026 09:52 · Dr. Gohar" },
  { title: "Transvaginal ultrasound request", detail: "Printed and given to the patient · 11 Oct 2026 09:55" },
  { title: "Swabs: vaginal + NAAT", detail: "Taken in clinic · 11 Oct 2026" },
];

export const labDelivery = ["Email to lab · [Clinic's usual lab]", "Email to patient", "Print"];
export const rxDelivery = ["Print and give to patient", "Email to patient"];
