"use client";

import { roleLabel, useMe } from "../../shell/useMe";
import { Icon } from "../../ui/icons";
import { Panel } from "../../ui/Panel";

/** Role banner and signed-in staff badge (replaces the doctor top bar on this screen). */
export function StaffHeader() {
  const me = useMe();
  const name = me?.name || me?.email || "";
  return (
    <Panel as="header" className="flex flex-wrap items-center gap-3 rounded-[22px] px-4 py-3">
      <span className="flex items-center gap-2 rounded-full bg-brand-tint px-3.5 py-2 text-[13px] text-ok-ink">
        <Icon name="audit" size={16} strokeWidth={2} />
        {!me
          ? "Checking your clinic role…"
          : me.is_lead
            ? "Signed in as the doctor · you can book visits, send forms and open every patient's notes."
            : "Signed in as clinic staff · you can book visits, send forms, scan files and send requests. Medical notes and alerts are doctor-only."}
      </span>
      {me ? (
        <div className="ms-auto flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-warn-tint font-bold uppercase text-warn-ink"
          >
            {name.charAt(0)}
          </span>
          <span className="flex flex-col leading-snug">
            <strong className="text-sm font-semibold">{name}</strong>
            <span className="text-xs text-muted">{roleLabel[me.role]}</span>
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
