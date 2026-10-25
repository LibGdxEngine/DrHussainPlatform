"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { emrRoutes } from "../../routes";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { appointments, formStatus, type Appointment } from "../data";

const rowGrid = "grid grid-cols-[60px_minmax(0,1.4fr)_100px_minmax(0,1fr)_140px] items-center gap-3";

function AppointmentRow({ item, done, onDone }: { item: Appointment; done: boolean; onDone: () => void }) {
  const isSend = item.action === "send";
  const status = formStatus[item.form];
  return (
    <div className={cn(rowGrid, "border-b border-line-soft px-1 py-3")}>
      <span className="font-emr-mono text-[13px] text-ink-3">{item.time}</span>
      <span className="flex flex-col gap-0.5">
        <strong className="text-sm font-semibold">{item.name}</strong>
        <span className="text-xs text-muted">{item.type}</span>
        {item.scanVisit ? (
          <Link
            href={`${emrRoutes.scan}?patient=${item.mrn}&visit=${item.scanVisit}`}
            className="text-xs font-semibold text-brand no-underline"
          >
            Scan the files she brought
          </Link>
        ) : null}
      </span>
      <Pill tone={done ? "brand" : status.tone} className="justify-self-start">
        {done ? (isSend ? "Link sent" : "Checked in") : status.label}
      </Pill>
      <span className="text-xs text-muted">{done ? "Just now · Mai Samir" : item.sent}</span>
      <ActionButton
        size="sm"
        variant={isSend ? "primary" : "quiet"}
        onClick={onDone}
        className={cn(
          "whitespace-nowrap",
          done && "border-canvas bg-canvas text-muted hover:border-canvas hover:bg-canvas hover:text-muted",
        )}
      >
        {done ? "Done ✓" : item.actionLabel}
      </ActionButton>
    </div>
  );
}

/** Day schedule; each row's action flips to a "done" state once pressed. */
export function AppointmentsTable() {
  const [sent, setSent] = useState<Record<string, boolean>>({});

  return (
    <Panel aria-labelledby="sch" className="flex flex-col gap-1.5 p-5">
      <h2 id="sch" className="m-0 mb-2 text-lg font-semibold">
        Schedule · Tuesday 13 Oct
      </h2>
      {appointments.map((a) => (
        <AppointmentRow
          key={a.id}
          item={a}
          done={!!sent[a.id]}
          onDone={() => setSent((s) => ({ ...s, [a.id]: true }))}
        />
      ))}
    </Panel>
  );
}
