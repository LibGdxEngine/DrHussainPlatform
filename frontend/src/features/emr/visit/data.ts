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
  "زيارة جديدة · آخر دورة من 14 شهر · الرحم موجود · الأقسام: سن اليأس، الإفرازات والالتهابات";

export const visitAlerts: VisitAlert[] = [
  {
    id: "R7",
    tone: "red",
    tag: "أحمر · R7",
    title: "نزيف بعد انقطاع الطمث: كشف وسونار مهبلي قبل كتابة العلاج",
    source: 'من القسم 3: "نزيف بعد ≥12 شهر من آخر دورة" = أيوه',
    needsReason: true,
  },
  {
    id: "R18",
    tone: "amber",
    tag: "أصفر · R18",
    title: "صداع نصفي مع أورة: عن طريق الجلد بس، ممنوع الحبوب المركبة",
    source: "من القسم 6ب",
  },
  {
    id: "R28",
    tone: "amber",
    tag: "أصفر · R28",
    title: "عامل خطر قلبي: تسمم حمل سابق. افحص الدهون والضغط",
    source: "من القسم 5",
  },
  {
    id: "R36",
    tone: "reminder",
    tag: "تذكير · R36",
    title: "ماموجرام متأخر (آخر مرة 2022)",
    source: "المدة متحددة في إعدادات العيادة",
    reminder: true,
  },
  {
    id: "R39",
    tone: "reminder",
    tag: "تذكير · R39",
    title: "Lp(a) عمره ما اتعمل: اطلبه مرة واحدة",
    source: "التحاليل",
    reminder: true,
  },
];

export const ackReasons = [
  "اتحجز سونار مهبلي قبل العلاج",
  "اتفحص، حميد",
  "هكتب إستروجين مهبلي بس",
  "سبب تاني (اكتبه تحت)",
];

export const ackDoneText = "اتأكد بواسطة د. جوهر · 09:41";

export const moduleTabs: { id: ModuleTabId; label: string }[] = [
  { id: "meno", label: "سن اليأس" },
  { id: "dis", label: "الإفرازات والالتهابات" },
  { id: "core", label: "التاريخ الأساسي" },
];

export const mrsDomains: MrsDomain[] = [
  { label: "جسدي", score: 8, max: 16, severity: "متوسط", percent: 50 },
  { label: "نفسي", score: 7, max: 16, severity: "شديد", percent: 44, dark: true },
  { label: "بولي تناسلي", score: 3, max: 12, severity: "متوسط", percent: 25 },
];

export const discharge: LabeledValue[] = [
  { label: "الإفرازات", value: "بيضا، من غير ريحة" },
  { label: "هرش", value: "أيوه، من 3 أسابيع" },
  { label: "حرقان في البول", value: "لا" },
  { label: "ألم في الحوض أو سخونية", value: "لا" },
  { label: "شريك جديد أو أكتر من شريك", value: "لا" },
  { label: "مقترح", value: "مسحات: مهبلية + NAAT كلاميديا/سيلان", highlight: true },
];

export const coreHistory: { title: string; body: string }[] = [
  { title: "الولادة", body: "G2 P2 · تسمم حمل (الحمل التاني)" },
  { title: "الأدوية", body: "Sertraline 50 مجم يومياً · فيتامين د" },
  { title: "التاريخ العائلي", body: "الأم: هشاشة عظام · مفيش سرطان ثدي أو جلطات" },
  { title: "نمط الحياة", body: "نوم 5 ساعات · نشاط يومين في الأسبوع · ضغط 7/10" },
  { title: "الفحوصات الدورية", body: "مسحة 2024 طبيعية · ماموجرام 2022" },
  { title: "الحساسية", body: "بنسلين (طفح) · مفيش حساسية فول سوداني" },
];

export const documentSlots: DocumentSlot[] = [
  { name: "نتايج التحاليل", meta: "2 · آخرها 3 أكتوبر" },
  { name: "سونار", meta: "1 · 2024" },
  { name: "أشعة تانية", meta: "ماموجرام 2022" },
  { name: "باثولوجي", meta: "مفيش" },
  { name: "ملاحظات ورق قديمة", meta: "3 سكان" },
  { name: "جوابات", meta: "1" },
];

export const keyValues: KeyValueRow[] = [
  { name: "Ferritin", result: "32 ng/mL", ideal: "50–150", out: true, idealLtr: true },
  { name: "HbA1c", result: "5.3%", ideal: "<5.4", idealLtr: true },
  { name: "TSH", result: "1.8", ideal: "1–2.5", idealLtr: true },
  { name: "LDL", result: "3.9 mmol/L", ideal: "حسب خطر القلب", out: true },
];

export const sentOrders: SentOrder[] = [
  { title: "طلب تحاليل: مبدئي – الكل + هرمونات", meta: "اتبعت للمعمل بالإيميل · 11 أكتوبر 2026" },
  { title: "طلب سونار مهبلي", meta: "اتطبع واتسلّم للمريضة · 11 أكتوبر 2026" },
  { title: "مسحات: مهبلية + NAAT كلاميديا/سيلان", meta: "اتاخدت في العيادة · 11 أكتوبر 2026" },
];

export const emails: EmailMessage[] = [
  {
    from: "doctor",
    meta: "الدكتور ← المريضة · 3 أكتوبر 2026",
    text: "نتايج الدم طلعت. مخزون الحديد واطي شوية؛ التفاصيل مرفقة.",
  },
  {
    from: "patient",
    meta: "المريضة ← الدكتور · 4 أكتوبر 2026",
    text: "شكراً. أبدأ مكمّل حديد؟",
  },
];
