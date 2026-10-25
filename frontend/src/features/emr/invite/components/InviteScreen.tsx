"use client";

import { useState } from "react";
import { emrRoutes } from "../../routes";
import { ActionButton, ActionLink } from "../../ui/Action";
import { roleDefs, shiftText } from "../data";
import { menuPreview, resolveGroups } from "../logic";
import type { InviteRole, PermissionOverrides } from "../types";
import { MenuPreview } from "./MenuPreview";
import { PermissionMatrix } from "./PermissionMatrix";
import { UserDetailsPanel } from "./UserDetailsPanel";
import Link from "next/link";

export function InviteScreen() {
  const [role, setRole] = useState<InviteRole>("nurse");
  const [overrides, setOverrides] = useState<PermissionOverrides>({});

  const roleLabel = roleDefs.find((r) => r.id === role)?.label ?? "";
  const groups = resolveGroups(role, overrides);

  const toggle = (permissionId: string, next: boolean) =>
    setOverrides((prev) => ({ ...prev, [role]: { ...prev[role], [permissionId]: next } }));
  const reset = () => setOverrides((prev) => ({ ...prev, [role]: {} }));

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-6">
        <div className="flex flex-col gap-1.5">
          <Link href={emrRoutes.audit} className="text-[13px] text-muted no-underline">
            المستخدمين والصلاحيات ←
          </Link>
          <h1 className="m-0 text-[30px] font-bold">ادعُ مستخدم جديد</h1>
        </div>
        <div className="ms-auto flex gap-2.5">
          <ActionLink href={emrRoutes.audit} variant="quiet">
            إلغاء
          </ActionLink>
          <ActionButton>ابعت الدعوة</ActionButton>
        </div>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-4">
          <UserDetailsPanel role={role} onRoleChange={setRole} />
          <MenuPreview roleLabel={roleLabel} menu={menuPreview(groups)} shift={shiftText(role)} />
        </div>
        <PermissionMatrix roleLabel={roleLabel} groups={groups} onToggle={toggle} onReset={reset} />
      </div>
    </>
  );
}
