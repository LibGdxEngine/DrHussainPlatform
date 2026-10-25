"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { SelectInput } from "../../ui/Fields";
import { ActionButton } from "../../ui/Action";
import { ackDoneText, ackReasons } from "../data";
import type { VisitAlert } from "../types";

const rowTone: Record<VisitAlert["tone"], string> = {
  red: "bg-danger-tint",
  amber: "bg-warn-wash",
  reminder: "bg-canvas",
};

interface AlertRowProps {
  alert: VisitAlert;
  acknowledged: boolean;
  asking: boolean;
  onStart: () => void;
  onConfirm: () => void;
}

function AlertRow({ alert, acknowledged, asking, onStart, onConfirm }: AlertRowProps) {
  const canAck = !acknowledged && !alert.reminder && !asking;
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl px-3.5 py-3",
        acknowledged ? "bg-canvas opacity-75" : rowTone[alert.tone],
      )}
    >
      <div className="flex items-center gap-3">
        <Pill tone={alert.tone} size="xs" className="shrink-0 px-2.5 py-1">
          {alert.tag}
        </Pill>
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-sm font-semibold leading-normal">{alert.title}</strong>
          <span className="text-xs text-muted">{alert.source}</span>
        </div>
        {canAck ? (
          <ActionButton
            variant="quiet"
            size="sm"
            onClick={onStart}
            className="ms-auto shrink-0 border-ink bg-white hover:bg-ink hover:text-white"
          >
            تأكيد
          </ActionButton>
        ) : null}
        {acknowledged ? (
          <span className="ms-auto shrink-0 text-xs font-semibold text-ok-ink">✓ {ackDoneText}</span>
        ) : null}
      </div>
      {asking ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            السبب
            <SelectInput className="min-h-[38px] w-auto rounded-[10px] text-[13px]">
              {ackReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </SelectInput>
          </label>
          <ActionButton variant="primary" size="sm" onClick={onConfirm} className="min-h-[38px] px-4">
            أكّد
          </ActionButton>
          <span className="basis-full text-xs text-muted">
            بيتسجل باسمك والوقت. الـ HRT الجهازي هيفضل مقفول لحد ما ده يتأكد.
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function AlertsPanel({ alerts }: { alerts: VisitAlert[] }) {
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [askingId, setAskingId] = useState<string | null>(null);

  const acknowledge = (id: string) => {
    setAcked((prev) => ({ ...prev, [id]: true }));
    setAskingId(null);
  };

  return (
    <Panel aria-labelledby="al" className="flex flex-col gap-2.5 p-5">
      <h2 id="al" className="m-0 mb-1 text-lg font-semibold">
        التنبيهات ({alerts.length})
      </h2>
      {alerts.map((a) => (
        <AlertRow
          key={a.id}
          alert={a}
          acknowledged={!!acked[a.id]}
          asking={askingId === a.id}
          onStart={() => (a.needsReason ? setAskingId(a.id) : acknowledge(a.id))}
          onConfirm={() => acknowledge(a.id)}
        />
      ))}
    </Panel>
  );
}
