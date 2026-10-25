import type { PermissionDef, PermissionGroupId, RoleDef } from "./types";

export const roleDefs: RoleDef[] = [
  { id: "doctor", label: "دكتور", hint: "كل الصلاحيات الطبية والإدارية" },
  { id: "nurse", label: "ممرضة", hint: "الحضور، العلامات الحيوية، المسحات" },
  { id: "staff", label: "استقبال", hint: "الحجز، الاستمارات، السكان" },
];

export const groupNames: Record<PermissionGroupId, string> = {
  visits: "المرضى والزيارات",
  med: "الطب",
  admin: "الإدارة",
};

export const groupOrder: PermissionGroupId[] = ["visits", "med", "admin"];

const perm = (
  group: PermissionGroupId,
  id: string,
  label: string,
  note: string | undefined,
  [doctor, nurse, staff]: [boolean, boolean, boolean],
  doctorOnly = false,
): PermissionDef => ({ group, id, label, note, defaults: { doctor, nurse, staff }, doctorOnly });

export const permissions: PermissionDef[] = [
  perm("visits", "checkin", "تسجيل حضور المريضة", undefined, [true, true, true]),
  perm("visits", "book", "حجز زيارات وبعت لينكات الاستمارات", undefined, [true, false, true]),
  perm("visits", "vitals", "تسجيل العلامات الحيوية", "ضغط، وزن، طول، وسط · بتظهر للدكتور في الكشف", [true, true, false]),
  perm("visits", "swabs", "تسجيل المسحات والعينات اللي اتاخدت", undefined, [true, true, false]),
  perm("visits", "scan", "سكان المستندات وكتابة القيم الأساسية", undefined, [true, true, true]),
  perm("med", "alertsView", "شوف التنبيهات (قراية بس)", "عشان تعرف الحالات الحمرا قبل ما تدخل", [true, true, false]),
  perm("med", "summary", "شوف ملخص الزيارة والدرجات", "من غير ملاحظات الدكتور", [true, true, false]),
  perm("med", "sendOrders", "بعت طلبات متكتبة قبل كده", undefined, [true, true, true]),
  perm("med", "ack", "تأكيد التنبيهات", undefined, [true, false, false], true),
  perm("med", "rx", "كتابة الروشتات وطلب التحاليل", undefined, [true, false, false], true),
  perm("med", "email", "إيميل النتايج وقراية الردود", undefined, [true, false, false]),
  perm("admin", "settings", "إعدادات العيادة وقواعد التنبيهات", undefined, [true, false, false], true),
  perm("admin", "audit", "سجل المراجعة والمستخدمين", undefined, [true, false, false], true),
];

/** Sidebar entries unlocked by a permission (the live "what they will see" preview). */
export const menuRules: { label: string; anyOf: string[] }[] = [
  { label: "المرضى", anyOf: ["summary", "vitals"] },
  { label: "المواعيد", anyOf: ["book", "checkin"] },
  { label: "المستندات", anyOf: ["scan"] },
  { label: "الرسائل", anyOf: ["email"] },
  { label: "إعدادات العيادة", anyOf: ["settings"] },
  { label: "سجل المراجعة", anyOf: ["audit"] },
];

export const alwaysVisibleMenu = "اليوم";

export function shiftText(role: string) {
  return role === "nurse" ? "الصبح 9–3 · الدخول برّه الوردية بيتسجل" : "من غير تحديد";
}
