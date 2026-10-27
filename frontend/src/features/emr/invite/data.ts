import type { MemberRole } from "@/lib/api/emr/staff";

export type InviteRole = Exclude<MemberRole, "OWNER">;

/** Owners are made from the user list, never by invitation. */
export const inviteRoles: { id: InviteRole; label: string; hint: string }[] = [
  { id: "MEMBER", label: "Clinic staff", hint: "Patients, appointments, forms, scanning and the inbox" },
  { id: "ADMIN", label: "Doctor access", hint: "Also orders, results emails, alerts, settings and users" },
];
