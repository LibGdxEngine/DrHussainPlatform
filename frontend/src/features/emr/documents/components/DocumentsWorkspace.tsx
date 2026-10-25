"use client";

import Link from "next/link";
import { useState } from "react";
import { emrRoutes } from "@/features/emr/routes";
import { ActionButton } from "@/features/emr/ui/Action";
import { Field, TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
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
        <h2 id="slt" className="m-0 mb-2 px-2 text-base font-semibold">الخانات</h2>
        {docSlots.map((s) => (
          <SlotButton key={s.id} name={s.name} count={s.count} active={s.id === slot} onPick={() => setSlot(s.id)} />
        ))}
        <ActionButton className="mt-2.5">+ سكان / رفع</ActionButton>
      </Panel>

      <div className="flex flex-col gap-4">
        <DropZone />
        <Panel aria-labelledby="dl" className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 id="dl" className="m-0 text-lg font-semibold">{current.label}</h2>
            <span className="text-[13px] text-muted">{current.meta}</span>
          </div>
          <div className="flex aspect-[3/3.4] items-center justify-center rounded-2xl border border-line bg-canvas text-[13px] text-subtle">
            معاينة الملف
          </div>
          <div className="flex gap-2">
            <ActionButton variant="quiet" size="sm" className="px-4">غيّر الاسم</ActionButton>
            <ActionButton variant="quiet" size="sm" className="px-4">تحميل</ActionButton>
          </div>
        </Panel>
      </div>

      <Panel aria-labelledby="kvs" className="flex flex-col gap-3 p-5">
        <h2 id="kvs" className="m-0 text-lg font-semibold">القيم الأساسية من السكان ده</h2>
        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          اكتب بس القيم اللي السيستم بيتابعها أو بينبّه عليها. اللي برّه الهدف المثالي للعيادة بيتظلل، مش بينبّه.
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
        <Field label="تاريخ العينة">
          <TextInput defaultValue="3 أكتوبر 2026" />
        </Field>
        <div className="flex items-center gap-2.5">
          <ActionButton className="px-[22px]">احفظ القيم</ActionButton>
          <Link href={emrRoutes.followup} className="text-sm font-semibold text-brand">شوف المؤشرات</Link>
        </div>
        <p className="m-0 text-xs text-muted">دخّلتها مي سمير · بيراجعها د. جوهر</p>
      </Panel>
    </div>
  );
}
