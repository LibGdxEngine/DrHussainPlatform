"use client";

import { useState } from "react";
import { Pill } from "../../ui/Pill";
import { auditTabs } from "../data";
import type { AuditTab } from "../types";
import { cn } from "@/lib/utils";
import { AuditLogPanel } from "./AuditLogPanel";
import { RolesPanel } from "./RolesPanel";
import { UsersPanel } from "./UsersPanel";

export function AuditScreen() {
  const [tab, setTab] = useState<AuditTab>("log");

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[30px] font-bold">Audit log and users</h1>
          <Pill tone="ok" size="sm" className="self-start font-normal">
            ✓ Append-only: rows cannot be edited or deleted from the platform
          </Pill>
        </div>
        <div role="tablist" className="ms-auto flex gap-1 rounded-full bg-canvas p-[5px]">
          {auditTabs.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={cn(
                  "min-h-[38px] cursor-pointer rounded-full px-[18px] text-[13px]",
                  on
                    ? "bg-white font-semibold text-brand-deep shadow-[0_1px_3px_rgb(14_59_39/0.12)]"
                    : "bg-transparent text-muted",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>
      {tab === "log" ? (
        <AuditLogPanel />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <UsersPanel />
          <RolesPanel />
        </div>
      )}
    </>
  );
}
