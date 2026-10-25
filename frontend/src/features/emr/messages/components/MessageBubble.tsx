"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { docSlots, type SlotId } from "@/features/emr/documents/data";
import { visitLabel, type VisitKey } from "@/features/emr/journey/data";
import { emrRoutes } from "@/features/emr/routes";
import { SelectInput } from "@/features/emr/ui/Fields";
import type { Message } from "../data";

/** Patient attachment: doctor/reception files it into the patient record (slot + visit). */
function IncomingAttachment({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slot, setSlot] = useState<SlotId>("lab");
  const [visit, setVisit] = useState<VisitKey>("v2");

  if (saved) {
    return (
      <Link
        href={emrRoutes.docs}
        className="inline-flex items-center gap-1.5 rounded-full border border-ok-tint bg-ok-tint px-3 py-1 text-xs font-semibold text-ok-ink no-underline"
      >
        ✓ {name} · saved to {docSlots.find((s) => s.id === slot)?.name} · {visitLabel[visit]}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-field bg-white px-3 py-1 text-xs font-semibold text-ink">
          📎 {name}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-brand"
        >
          Save to file
        </button>
      </span>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas p-2.5">
          <SelectInput
            aria-label="Category"
            value={slot}
            onChange={(e) => setSlot(e.target.value as SlotId)}
            className="min-h-9 w-auto text-xs"
          >
            {docSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            aria-label="Visit"
            value={visit}
            onChange={(e) => setVisit(e.target.value as VisitKey)}
            className="min-h-9 w-auto text-xs"
          >
            {(Object.keys(visitLabel) as VisitKey[]).map((v) => (
              <option key={v} value={v}>
                {visitLabel[v]}
              </option>
            ))}
          </SelectInput>
          <button
            type="button"
            onClick={() => setSaved(true)}
            className="min-h-9 cursor-pointer rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-ink"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const fromDoctor = message.from === "doc";
  return (
    <li
      className={cn(
        "flex max-w-[78%] flex-col gap-1.5 rounded-[20px] border px-4 py-3.5",
        fromDoctor ? "self-start border-brand-tint bg-brand-tint" : "self-end border-field bg-white",
      )}
    >
      <span className="text-xs text-muted">
        {message.who} · {message.when}
      </span>
      <span className="text-sm leading-[1.8]">{message.text}</span>
      {message.att.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {message.att.map((a) =>
            fromDoctor ? (
              <Link
                key={a}
                href={emrRoutes.docs}
                className="inline-flex items-center gap-1.5 rounded-full border border-field bg-white px-3 py-1 text-xs font-semibold text-ink no-underline"
              >
                📎 {a}
              </Link>
            ) : (
              <IncomingAttachment key={a} name={a} />
            ),
          )}
        </div>
      ) : null}
    </li>
  );
}
