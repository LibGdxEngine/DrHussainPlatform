import type {
  AuditRow,
  AuditTab,
  ClinicUser,
  PermissionCell,
  RolePermissionRow,
} from "./types";

export const auditTabs: { id: AuditTab; label: string }[] = [
  { id: "log", label: "سجل المراجعة" },
  { id: "users", label: "المستخدمين والصلاحيات" },
];

export const periodOptions = ["آخر 7 أيام", "النهارده", "آخر 30 يوم"];
export const userFilterOptions = ["كل المستخدمين", "د. ح. جوهر", "مي سمير", "المرضى"];
export const actionFilterOptions = ["كل الإجراءات", "مشاهدة", "تعديل", "تأكيد تنبيه", "إرسال", "مرفوض"];

export const auditRows: AuditRow[] = [
  { time: "13 أكتوبر 09:41", who: "د. ح. جوهر", role: "دكتور", action: "تأكيد تنبيه", patient: "VC-000142", details: 'R7 · السبب: "اتحجز سونار مهبلي قبل العلاج"', outcome: "success" },
  { time: "13 أكتوبر 09:38", who: "د. ح. جوهر", role: "دكتور", action: "فتح ملخص الزيارة", patient: "VC-000142", details: "الملخص، تاب سن اليأس", outcome: "success" },
  { time: "13 أكتوبر 09:20", who: "مي سمير", role: "موظفة العيادة", action: "فتح التنبيهات", patient: "VC-000142", details: "دور الموظف مش مسموح له يشوف التنبيهات الطبية", outcome: "denied" },
  { time: "13 أكتوبر 09:12", who: "مي سمير", role: "موظفة العيادة", action: "كتابة قيم أساسية", patient: "VC-000142", details: "Ferritin 32، HbA1c 5.3، TSH 1.8 · من سكان 3 أكتوبر", outcome: "success" },
  { time: "12 أكتوبر 21:04", who: "ليلى أحمد", role: "مريضة", action: "رد على إيميل", patient: "VC-000142", details: 'محادثة "نتايج الدم" · اتحفظت في الملف', outcome: "success" },
  { time: "12 أكتوبر 18:30", who: "نور صالح", role: "مريضة", action: "بعتت استمارة المتابعة", patient: "VC-000118", details: "MRS 9 · دخلت باللينك + الكود", outcome: "success" },
  { time: "12 أكتوبر 11:02", who: "د. ح. جوهر", role: "دكتور", action: "تعديل قاعدة تنبيه", patient: "إعدادات العيادة", details: "اتحدد ميعاد الماموجرام R36 · R16 من غير تغيير", outcome: "success" },
  { time: "11 أكتوبر 09:52", who: "د. ح. جوهر", role: "دكتور", action: "بعت طلب تحاليل", patient: "VC-000142", details: "مبدئي – الكل + هرمونات · اتبعت للمعمل بالإيميل", outcome: "success" },
];

export const outcomeLabel = { success: "نجح", denied: "مرفوض" } as const;

const YES: PermissionCell = { text: "أيوه", tone: "yes" };
const NO: PermissionCell = { text: "لا", tone: "no" };
const OWN: PermissionCell = { text: "بتاعتها بس", tone: "own" };
const READ_ONLY: PermissionCell = { text: "قراية بس", tone: "readOnly" };
const NA: PermissionCell = { text: "—", tone: "na" };

const row = (
  action: string,
  doctor: PermissionCell,
  nurse: PermissionCell,
  staff: PermissionCell,
  patient: PermissionCell,
): RolePermissionRow => ({ action, doctor, nurse, staff, patient });

export const rolePermissions: RolePermissionRow[] = [
  row("حجز زيارات، بعت لينكات الاستمارات", YES, NO, YES, NO),
  row("تسجيل الحضور والعلامات الحيوية", YES, YES, NO, NO),
  row("سكان، تسمية، كتابة القيم الأساسية", YES, YES, YES, NO),
  row("شوف الملخص والتنبيهات والدرجات", YES, READ_ONLY, NO, NO),
  row("تأكيد التنبيهات، كتابة الروشتات", YES, NO, NO, NO),
  row("بعت طلبات متكتبة قبل كده", YES, YES, YES, NO),
  row("بعت النتايج بالإيميل، قراية الردود", YES, NO, NO, OWN),
  row("ملي الاستمارات، شوف مؤشراتها", NA, NO, NO, OWN),
  row("إعدادات العيادة، سجل المراجعة", YES, NO, NO, NO),
];

export const clinicUsers: ClinicUser[] = [
  {
    id: "doctor",
    name: "د. حسين جوهر",
    email: "hsgohar@gmail.com",
    roleLabel: "دكتور · أدمن",
    roleTone: "brand",
    avatar: { kind: "photo" },
    meta: { kind: "text", text: "Passkey · دلوقتي" },
  },
  {
    id: "staff",
    name: "مي سمير",
    email: "clinicgohar@gmail.com",
    roleLabel: "موظفة العيادة",
    roleTone: "neutral",
    avatar: { kind: "initial", letter: "م", className: "bg-warn-tint text-warn-ink" },
    meta: { kind: "text", text: "تطبيق التحقق · 09:20" },
  },
  {
    id: "nurse",
    name: "سارة محمود",
    email: "nurse.vclinic@gmail.com",
    roleLabel: "ممرضة",
    roleTone: "brand",
    avatar: { kind: "initial", letter: "س", className: "bg-brand-tint text-brand-deep" },
    meta: { kind: "inviteLink", text: "الدعوة مستنية · عدّل الصلاحيات" },
  },
];

export const patientsNote =
  "المرضى ملهمش حسابات موظفين. بيفتحوا لينك استمارة لمرة واحدة ويأكدوا بتاريخ الميلاد + كود بيوصل SMS؛ بيشوفوا استماراتهم ونتايجهم وإيميلاتهم بس.";
