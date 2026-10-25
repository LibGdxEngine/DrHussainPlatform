"use client";

import Link from "next/link";
import { useState } from "react";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton, ActionLink } from "@/features/emr/ui/Action";
import { Field, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { docSlots, initialKv, keyValues, type SlotId } from "../data";
import { DropZone } from "./DropZone";
import { KeyValueHeader, KeyValueRow } from "./KeyValueRow";
import { SlotButton } from "./SlotButton";

export function DocumentsWorkspace() {
  const [slot, setSlot] = useState<SlotId>("lab");
  const [kv, setKv] = useState(initialKv);
  const current = docSlots.find((s) => s.id === slot) ?? docSlots[0];

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
      <Panel aria-labelledby="slt" className="flex flex-col gap-1 p-4">
        <h2 id="slt" className="m-0 mb-2 px-2 text-base font-semibold">Categories</h2>
        {docSlots.map((s) => (
          <SlotButton key={s.id} name={s.name} count={s.count} active={s.id === slot} onPick={() => setSlot(s.id)} />
        ))}
        <ActionLink href={`${emrRoutes.scan}?patient=VC-000142&visit=v2`} className="mt-2.5">
          + Scan / upload
        </ActionLink>
      </Panel>

      <div className="flex flex-col gap-4">
        <DropZone />
        <Panel aria-labelledby="dl" className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 id="dl" className="m-0 text-lg font-semibold">{current.label}</h2>
            <span className="text-[13px] text-muted">{current.meta}</span>
          {current.origin !== "—" ? (
            <Pill tone="brand" size="xs" className="self-start">
              {current.origin}
            </Pill>
          ) : null}
          </div>
          <div className="flex aspect-[3/3.4] items-center justify-center rounded-2xl border border-line bg-canvas text-[13px] text-subtle">
            File preview
          </div>
          <div className="flex gap-2">
            <ActionButton variant="quiet" size="sm" className="px-4">Rename</ActionButton>
            <ActionButton variant="quiet" size="sm" className="px-4">Download</ActionButton>
          </div>
        </Panel>
      </div>

      <Panel aria-labelledby="kvs" className="flex flex-col gap-3 p-5">
        <h2 id="kvs" className="m-0 text-lg font-semibold">Key values from this scan</h2>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          Enter only the values the system tracks or alerts on. Values outside the clinic&apos;s optimal target are shaded, not flagged as alerts.
        </p>
        <KeyValueHeader />
        {keyValues.map((def) => (
          <KeyValueRow
            key={def.id}
            def={def}
            value={kv[def.id]}
            onChange={(v) => setKv((prev) => ({ ...prev, [def.id]: v }))}
          />
        ))}
        <Field label="Sample date">
          <TextInput defaultValue="3 Oct 2026" />
        </Field>
        <div className="flex items-center gap-2.5">
          <ActionButton className="px-[22px]">Save values</ActionButton>
          <Link href={emrRoutes.followup} className="text-sm font-semibold text-brand">View trends</Link>
        </div>
        <p className="m-0 text-xs text-muted">Entered by Mai Samir · reviewed by Dr. Gohar</p>
      </Panel>
    </div>
  );
}
