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
  { name: "مبدئي – الكل", ids: ["ferritin", "vitd", "b12", "tsh", "ft4", "ft3", "tpo", "dheas", "cbc", "cmp", "insulin", "hba1c", "lipids"] },
  { name: "مبدئي – اختياري", ids: ["ggt", "hscrp", "homocys", "apob", "lpa", "iodine", "prl", "rt3"] },
  { name: "هرمونات أنثوية", ids: ["e2", "prog", "fsh", "testo", "shbg"] },
  { name: "متابعة HRT", ids: ["e2", "prog", "testo", "dheas"] },
  { name: "نزيف", ids: ["cbc", "ferritin", "tsh", "bhcg", "tvus"] },
  { name: "تكيس المبايض", ids: ["testo", "shbg", "dheas", "lh", "fsh", "prl", "tsh", "ohp", "hba1c", "insulin", "lipids"] },
  { name: "التهابات / أمراض منقولة", ids: ["swab", "naat", "hiv", "syph", "hep"] },
  { name: "خصوبة", ids: ["fsh", "lh", "e2", "amh", "prog", "tsh", "prl", "rubella", "semen"] },
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
  { id: "estriol", name: "Estriol 0.1% vaginal cream", sig: "0.5 جم كل ليلة لمدة أسبوعين، وبعدين مرتين في الأسبوع", kind: "مهبلي · مش مقفول" },
  { id: "e2gel", name: "Estradiol gel 0.06%", sig: "2 ضغطة (1.5 مجم) يومياً على الجلد", kind: "إستروجين جهازي" },
  { id: "prom", name: "Micronised progesterone 100 mg (Prometrium)", sig: "كبسولة كل ليلة", kind: "حماية بطانة الرحم" },
  { id: "vitd", name: "Vitamin D3 2000 IU", sig: "واحدة يومياً", kind: "مكمّل" },
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
      tag: "أحمر · R7 · مقفول",
      title: "نزيف بعد انقطاع الطمث لسه ما اتأكدش",
      text: "الـ HRT الجهازي مقفول لحد ما تأكد R7 بسبب في صفحة الملخص.",
      action: "روح للتنبيه",
      target: "visit",
    });
  }
  if (meds.e2gel && !meds.prom) {
    blocks.push({
      tag: "أحمر · R10 · مقفول",
      title: "الرحم موجود: إستروجين جهازي من غير بروجسترون أو LNG-IUS",
      text: "ضيف حماية لبطانة الرحم، زي micronised progesterone.",
      action: "ضيف بروجسترون",
      target: "orders",
    });
  }
  return blocks;
}

export const sentLog = [
  { title: "طلب تحاليل: مبدئي – الكل + هرمونات", detail: "اتبعت للمعمل بالإيميل · 11 أكتوبر 2026 09:52 · د. جوهر" },
  { title: "طلب سونار مهبلي", detail: "اتطبع واتسلّم للمريضة · 11 أكتوبر 2026 09:55" },
  { title: "مسحات: مهبلية + NAAT", detail: "اتاخدت في العيادة · 11 أكتوبر 2026" },
];

export const labDelivery = ["إيميل للمعمل · [المعمل المعتاد للعيادة]", "إيميل للمريضة", "طباعة"];
export const rxDelivery = ["اطبعها وسلّمها للمريضة", "إيميل للمريضة"];
