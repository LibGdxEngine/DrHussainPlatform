export type InviteRole = "doctor" | "nurse" | "staff";
export type PermissionGroupId = "visits" | "med" | "admin";

export interface PermissionDef {
  id: string;
  group: PermissionGroupId;
  label: string;
  note?: string;
  /** Default on/off per role. */
  defaults: Record<InviteRole, boolean>;
  /** Locked (and forced off) for every role except the doctor. */
  doctorOnly?: boolean;
}

export interface RoleDef {
  id: InviteRole;
  label: string;
  hint: string;
}

export type PermissionOverrides = Partial<Record<InviteRole, Record<string, boolean>>>;

export interface ResolvedPermission {
  def: PermissionDef;
  locked: boolean;
  on: boolean;
}

export interface ResolvedGroup {
  id: PermissionGroupId;
  name: string;
  items: ResolvedPermission[];
}
