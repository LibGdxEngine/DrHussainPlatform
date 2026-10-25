import type { Adherence, OverallFeeling, Option, PeriodStatus, VisitReason } from "./types";

export const menopauseModule = { name: "أسئلة سن اليأس", minutes: "حوالي 4 دقايق" };

export const visitReasons: VisitReason[] = [
  { id: "routine", label: "كشف دوري / مسحة" },
  { id: "heavy", label: "دورة غزيرة أو مش منتظمة", module: { title: "نزيف غزير أو مش منتظم", minutes: "2 دقيقة" } },
  { id: "bleed", label: "نزيف بين الدورات أو بعد العلاقة أو بعد الانقطاع", module: { title: "النزيف", minutes: "دقيقة" } },
  { id: "pain", label: "ألم في الحوض أو مع الدورة", module: { title: "ألم الحوض", minutes: "2 دقيقة" } },
  { id: "contra", label: "منع الحمل", module: { title: "منع الحمل + أمان الهرمونات", minutes: "3 دقايق" } },
  { id: "ttc", label: "بحاول أحمل", module: { title: "محاولة الحمل", minutes: "دقيقة" } },
  { id: "pcos", label: "تكيس المبايض، حبوب أو شعر زيادة", module: { title: "تكيس المبايض", minutes: "2 دقيقة" } },
  { id: "dis", label: "إفرازات أو التهاب", module: { title: "الإفرازات والالتهابات", minutes: "دقيقة" } },
  { id: "uri", label: "تسريب بول أو هبوط", module: { title: "البول والهبوط", minutes: "دقيقة" } },
  { id: "pms", label: "تعب ما قبل الدورة", module: { title: "ما قبل الدورة", minutes: "دقيقة" } },
  { id: "smear", label: "متابعة مسحة مش طبيعية", module: { title: "متابعة المسحة", minutes: "دقيقة" } },
  { id: "breast", label: "قلق بخصوص الثدي", module: { title: "الثدي", minutes: "دقيقة" } },
  { id: "meno", label: "أعراض سن اليأس (سخونة، نوم، مزاج)", menopause: true },
  { id: "hrt", label: "مراجعة العلاج الهرموني", menopause: true },
  { id: "lib", label: "قلة الرغبة أو جفاف مهبلي", menopause: true },
  { id: "other", label: "حاجة تانية" },
];

export const defaultReasonIds = ["meno", "dis"];
/** Fixed steps of the form besides the per-reason modules. */
export const baseStepCount = 7;

export const periodOptions: Option<PeriodStatus>[] = [
  { id: "reg", label: "منتظمة" },
  { id: "irr", label: "مش منتظمة" },
  { id: "stopped", label: "وقفت" },
  { id: "horm", label: "باخد هرمونات ومش عارفة" },
  { id: "hyst", label: "شلت الرحم" },
];

export const mrsItems = [
  "هبّات سخونة، عرق",
  "تعب في القلب (إحساس بالضربات، تخطّي، سرعة، ضيق)",
  "مشاكل في النوم",
  "مزاج مكتئب",
  "عصبية",
  "قلق",
  "إرهاق جسدي وذهني",
  "مشاكل جنسية",
  "مشاكل في المثانة",
  "جفاف المهبل",
  "ألم في المفاصل والعضلات",
];

export const mrsScale = ["مفيش", "بسيط", "متوسط", "شديد", "شديد جداً"];
export const mrsScores = [0, 1, 2, 3, 4];
export const defaultMrs = [3, 1, 3, 2, 2, 1, 2, 2, 0, 1, 1];
export const mrsMax = 44;

/** MRS sub-scale item indexes. */
export const mrsGroups = {
  somatic: [0, 1, 2, 10],
  psychological: [3, 4, 5, 6],
  urogenital: [7, 8, 9],
};
/** Item 2 (heart) at or above this raises the R30 flag. */
export const mrsHeartThreshold = 3;
/** Item 8 (sexual) at or above this opens the sexual-health section. */
export const mrsSexualThreshold = 2;

export const overallOptions: Option<OverallFeeling>[] = [
  { id: "much", label: "أحسن بكتير" },
  { id: "better", label: "أحسن" },
  { id: "same", label: "زي ما أنا" },
  { id: "worse", label: "أوحش" },
];

export const adherenceOptions: Option<Adherence>[] = [
  { id: "yes", label: "أيوه" },
  { id: "some", label: "أحياناً" },
  { id: "stop", label: "وقفته" },
];

export const sideEffectOptions: Option[] = [
  { id: "breast", label: "ألم في الثدي" },
  { id: "bloat", label: "انتفاخ" },
  { id: "head", label: "صداع" },
  { id: "sleepy", label: "نعاس" },
  { id: "mood", label: "مزاج واطي" },
  { id: "acne", label: "حبوب" },
  { id: "hair", label: "تساقط شعر" },
  { id: "facial", label: "شعر في الوش" },
];

export const yesNo: Option[] = [
  { id: "yes", label: "أيوه" },
  { id: "no", label: "لا" },
];
export const yesNoUnsure: Option[] = [...yesNo, { id: "unsure", label: "مش متأكدة" }];

/** Follow-up progress chart: MRS at start / 6 weeks / now. */
export const followUpBars = [
  { label: "البداية", value: 21, height: 84, kind: "hatched" },
  { label: "6 أسابيع", value: 14, height: 56, kind: "mid" },
  { label: "دلوقتي", value: 9, height: 36, kind: "dark" },
] as const;

export const followUpMeds = ["Estradiol patch 50 mcg", "Progesterone 100 mg"];

export const otpInitial = "729";
