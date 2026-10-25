import type {
  DocumentSlot,
  EmailMessage,
  KeyValueRow,
  LabeledValue,
  ModuleTabId,
  MrsDomain,
  SentOrder,
  VisitAlert,
} from "./types";

export const patientMeta =
  "New visit · Last period 14 months ago · Uterus present · Modules: Menopause, Discharge & infections";

export const visitAlerts: VisitAlert[] = [
  {
    id: "R7",
    tone: "red",
    tag: "Red · R7",
    title: "Postmenopausal bleeding: examine and do a transvaginal ultrasound before prescribing",
    source: 'From section 3: "Bleeding ≥12 months after last period" = Yes',
    needsReason: true,
  },
  {
    id: "R18",
    tone: "amber",
    tag: "Amber · R18",
    title: "Migraine with aura: transdermal only, no combined pills",
    source: "From section 6b",
  },
  {
    id: "R28",
    tone: "amber",
    tag: "Amber · R28",
    title: "Cardiac risk factor: previous pre-eclampsia. Check lipids and BP",
    source: "From section 5",
  },
  {
    id: "R36",
    tone: "reminder",
    tag: "Reminder · R36",
    title: "Mammogram overdue (last in 2022)",
    source: "Interval set in clinic settings",
    reminder: true,
  },
  {
    id: "R39",
    tone: "reminder",
    tag: "Reminder · R39",
    title: "Lp(a) never tested: order once",
    source: "Labs",
    reminder: true,
  },
];

export const ackReasons = [
  "Transvaginal ultrasound booked before treatment",
  "Examined, benign",
  "Prescribing vaginal estrogen only",
  "Other reason (write below)",
];

export const ackDoneText = "Confirmed by Dr. Gohar · 09:41";

export const moduleTabs: { id: ModuleTabId; label: string }[] = [
  { id: "meno", label: "Menopause" },
  { id: "dis", label: "Discharge & infections" },
  { id: "core", label: "Core history" },
];

export const mrsDomains: MrsDomain[] = [
  { label: "Somatic", score: 8, max: 16, severity: "Moderate", percent: 50 },
  { label: "Psychological", score: 7, max: 16, severity: "Severe", percent: 44, dark: true },
  { label: "Urogenital", score: 3, max: 12, severity: "Moderate", percent: 25 },
];

export const discharge: LabeledValue[] = [
  { label: "Discharge", value: "White, no odour" },
  { label: "Itching", value: "Yes, for 3 weeks" },
  { label: "Burning on urination", value: "No" },
  { label: "Pelvic pain or fever", value: "No" },
  { label: "New or multiple partners", value: "No" },
  { label: "Suggested", value: "Swabs: vaginal + chlamydia/gonorrhoea NAAT", highlight: true },
];

export const coreHistory: { title: string; body: string }[] = [
  { title: "Obstetric", body: "G2 P2 · Pre-eclampsia (2nd pregnancy)" },
  { title: "Medications", body: "Sertraline 50 mg daily · Vitamin D" },
  { title: "Family history", body: "Mother: osteoporosis · No breast cancer or clots" },
  { title: "Lifestyle", body: "Sleeps 5 hours · Active 2 days a week · Stress 7/10" },
  { title: "Screening", body: "Smear 2024 normal · Mammogram 2022" },
  { title: "Allergies", body: "Penicillin (rash) · No peanut allergy" },
];

export const documentSlots: DocumentSlot[] = [
  { name: "Lab results", meta: "2 · Latest 3 Oct" },
  { name: "Ultrasound", meta: "1 · 2024" },
  { name: "Other imaging", meta: "Mammogram 2022" },
  { name: "Pathology", meta: "None" },
  { name: "Old paper notes", meta: "3 scans" },
  { name: "Letters", meta: "1" },
];

export const keyValues: KeyValueRow[] = [
  { name: "Ferritin", result: "32 ng/mL", ideal: "50–150", out: true },
  { name: "HbA1c", result: "5.3%", ideal: "<5.4" },
  { name: "TSH", result: "1.8", ideal: "1–2.5" },
  { name: "LDL", result: "3.9 mmol/L", ideal: "Per cardiac risk", out: true },
];

export const sentOrders: SentOrder[] = [
  { title: "Lab request: Baseline – all + hormones", meta: "Emailed to the lab · 11 Oct 2026" },
  { title: "Transvaginal ultrasound request", meta: "Printed and given to the patient · 11 Oct 2026" },
  { title: "Swabs: vaginal + chlamydia/gonorrhoea NAAT", meta: "Taken in clinic · 11 Oct 2026" },
];

export const emails: EmailMessage[] = [
  {
    from: "doctor",
    meta: "Doctor → Patient · 3 Oct 2026",
    text: "Your blood results are back. Your iron stores are a little low; details attached.",
  },
  {
    from: "patient",
    meta: "Patient → Doctor · 4 Oct 2026",
    text: "Thank you. Should I start an iron supplement?",
  },
];
