export type AuditOutcome = "success" | "denied";

export interface AuditRow {
  time: string;
  who: string;
  role: string;
  action: string;
  patient: string;
  details: string;
  outcome: AuditOutcome;
}

export type PermissionTone = "yes" | "no" | "own" | "readOnly" | "na";

export interface PermissionCell {
  text: string;
  tone: PermissionTone;
}

export interface RolePermissionRow {
  action: string;
  doctor: PermissionCell;
  nurse: PermissionCell;
  staff: PermissionCell;
  patient: PermissionCell;
}

export interface ClinicUser {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  roleTone: "brand" | "neutral";
  avatar: { kind: "photo" } | { kind: "initial"; letter: string; className: string };
  meta: { kind: "text"; text: string } | { kind: "inviteLink"; text: string };
}

export type AuditTab = "log" | "users";
