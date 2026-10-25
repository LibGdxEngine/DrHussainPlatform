import type { PermissionDef, PermissionGroupId, RoleDef } from "./types";

export const roleDefs: RoleDef[] = [
  { id: "doctor", label: "Doctor", hint: "All clinical and admin permissions" },
  { id: "nurse", label: "Nurse", hint: "Check-in, vital signs, swabs" },
  { id: "staff", label: "Reception", hint: "Booking, forms, scanning" },
];

export const groupNames: Record<PermissionGroupId, string> = {
  visits: "Patients and visits",
  med: "Clinical",
  admin: "Administration",
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
  perm("visits", "checkin", "Check in patients", undefined, [true, true, true]),
  perm("visits", "book", "Book visits and send form links", undefined, [true, false, true]),
  perm("visits", "vitals", "Record vital signs", "BP, weight, height, waist · shown to the doctor during the visit", [true, true, false]),
  perm("visits", "swabs", "Record swabs and samples taken", undefined, [true, true, false]),
  perm("visits", "scan", "Scan documents and enter key values", undefined, [true, true, true]),
  perm("med", "alertsView", "View alerts (read only)", "To spot red-flag cases before they go in", [true, true, false]),
  perm("med", "summary", "View visit summary and scores", "Excludes doctor's notes", [true, true, false]),
  perm("med", "sendOrders", "Send pre-written orders", undefined, [true, true, true]),
  perm("med", "ack", "Acknowledge alerts", undefined, [true, false, false], true),
  perm("med", "rx", "Write prescriptions and order labs", undefined, [true, false, false], true),
  perm("med", "email", "Email results and read replies", undefined, [true, false, false]),
  perm("admin", "settings", "Clinic settings and alert rules", undefined, [true, false, false], true),
  perm("admin", "audit", "Audit log and users", undefined, [true, false, false], true),
];

/** Sidebar entries unlocked by a permission (the live "what they will see" preview). */
export const menuRules: { label: string; anyOf: string[] }[] = [
  { label: "Patients", anyOf: ["summary", "vitals"] },
  { label: "Appointments", anyOf: ["book", "checkin"] },
  { label: "Documents", anyOf: ["scan"] },
  { label: "Messages", anyOf: ["email"] },
  { label: "Clinic settings", anyOf: ["settings"] },
  { label: "Audit log", anyOf: ["audit"] },
];

export const alwaysVisibleMenu = "Today";

export function shiftText(role: string) {
  return role === "nurse" ? "Mornings 9–3 · sign-ins outside the shift are logged" : "Unrestricted";
}
