import { alwaysVisibleMenu, groupNames, groupOrder, menuRules, permissions } from "./data";
import type { InviteRole, PermissionOverrides, ResolvedGroup } from "./types";

/** Effective permission state for a role: defaults + per-role overrides, with doctor-only locks. */
export function resolveGroups(role: InviteRole, overrides: PermissionOverrides): ResolvedGroup[] {
  const roleOverrides = overrides[role] ?? {};
  return groupOrder.map((id) => ({
    id,
    name: groupNames[id],
    items: permissions
      .filter((p) => p.group === id)
      .map((def) => {
        const locked = role !== "doctor" && !!def.doctorOnly;
        const on = locked ? false : (roleOverrides[def.id] ?? def.defaults[role]);
        return { def, locked, on };
      }),
  }));
}

export function menuPreview(groups: ResolvedGroup[]): string[] {
  const enabled = new Set(
    groups.flatMap((g) => g.items.filter((i) => i.on).map((i) => i.def.id)),
  );
  return [
    alwaysVisibleMenu,
    ...menuRules.filter((r) => r.anyOf.some((id) => enabled.has(id))).map((r) => r.label),
  ];
}
