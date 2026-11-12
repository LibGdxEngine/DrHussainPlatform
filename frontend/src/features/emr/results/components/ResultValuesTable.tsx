"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ResultValue, ValueCheck } from "@/lib/api/emr/results";
import { formatDay } from "../../format";
import { ActionButton } from "../../ui/Action";
import { TextInput } from "../../ui/Fields";
import { Pill } from "../../ui/Pill";
import { changeLabel, checkReasonLabel, comparisonNotes, needsCheck } from "../labels";

function rangeText(value: ResultValue) {
  if (value.ref_text) return value.ref_text;
  if (value.ref_low != null && value.ref_high != null) return `${value.ref_low}–${value.ref_high}`;
  return "—";
}

const flagPill: Record<string, { tone: "red" | "amber" | "ok"; text: string }> = {
  H: { tone: "amber", text: "High" },
  L: { tone: "amber", text: "Low" },
  A: { tone: "red", text: "Abnormal" },
  N: { tone: "ok", text: "Normal" },
};

interface ResultValuesTableProps {
  values: ResultValue[];
  /**
   * Confirm (empty body) or correct a value marked "Check this value". Resolves true when saved.
   * Without it the badge is shown but there is no control.
   */
  onCheck?: (value: ResultValue, body: ValueCheck) => Promise<boolean>;
  busy?: boolean;
}

/** Each value read from a report, flagged when abnormal, beside the previous result and its date. */
export function ResultValuesTable({ values, onCheck, busy = false }: ResultValuesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-start text-xs text-muted">
            <th className="py-1.5 pe-2 text-start font-medium">Test</th>
            <th className="py-1.5 pe-2 text-start font-medium">Result</th>
            <th className="py-1.5 pe-2 text-start font-medium">Range</th>
            <th className="py-1.5 text-start font-medium">Previous</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <ValueRows key={v.id} value={v} onCheck={onCheck} busy={busy} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValueRows({ value: v, onCheck, busy }: { value: ResultValue; onCheck?: ResultValuesTableProps["onCheck"]; busy: boolean }) {
  const [correcting, setCorrecting] = useState(false);
  const flag = v.flag ? flagPill[v.flag] : null;
  const previous = v.comparison.previous;
  const check = needsCheck(v);
  const notes = comparisonNotes(v.comparison);
  return (
    <>
      <tr className={cn("border-t border-line-soft align-top", check && "bg-warn-wash")}>
        <td className="py-2 pe-2 font-semibold">
          {v.test?.name ?? v.raw_name}
          {!v.test ? <span className="block text-[11px] font-normal text-subtle">Not in the catalog</span> : null}
        </td>
        <td className="py-2 pe-2">
          {v.unreadable ? (
            <Pill tone="red" size="xs">Unreadable</Pill>
          ) : (
            <span className={cn(v.abnormal && "font-semibold text-danger-ink")}>
              {v.value_text} {v.unit}
            </span>
          )}
          {flag && flag.text !== "Normal" ? (
            <Pill tone={flag.tone} size="xs" className="ms-1.5">{flag.text}</Pill>
          ) : null}
          {check ? (
            <span className="mt-1 flex flex-col gap-1">
              <Pill tone="amber" size="xs" className="self-start">Check this value</Pill>
              <span className="text-[11px] font-normal text-warn-ink">{checkReasonLabel(v.check_reason)}</span>
              {onCheck && !correcting ? (
                <span className="flex flex-wrap gap-1.5">
                  <ActionButton size="sm" disabled={busy} onClick={() => void onCheck(v, {})}>
                    Confirm as read
                  </ActionButton>
                  <ActionButton variant="quiet" size="sm" disabled={busy} onClick={() => setCorrecting(true)}>
                    Correct
                  </ActionButton>
                </span>
              ) : null}
            </span>
          ) : v.checked_at ? (
            <span className="mt-1 block text-[11px] font-normal text-subtle">Checked {formatDay(v.checked_at)}</span>
          ) : null}
        </td>
        <td className="py-2 pe-2 text-ink-3">{rangeText(v)}</td>
        <td className="py-2 text-ink-3">
          {previous ? (
            <>
              {previous.value_text} {previous.unit} · {formatDay(previous.result_date)}
              <span
                className={cn(
                  "block text-[11px]",
                  v.comparison.change === "not_comparable" ? "font-semibold text-warn-ink" : "text-subtle",
                )}
              >
                {changeLabel(v.comparison)}
              </span>
              {notes.map((note) => (
                <span key={note} className="block text-[11px] text-warn-ink">{note}</span>
              ))}
            </>
          ) : (
            <span className="text-subtle">{changeLabel(v.comparison)}</span>
          )}
        </td>
      </tr>
      {check && onCheck && correcting ? (
        <tr className="bg-warn-wash">
          <td colSpan={4} className="pb-2.5">
            <CorrectionForm
              value={v}
              busy={busy}
              onCancel={() => setCorrecting(false)}
              onSave={async (body) => {
                if (await onCheck(v, body)) setCorrecting(false);
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** The doctor's corrections for one value; unchanged fields are left out and confirmed as read. */
function CorrectionForm({
  value, busy, onCancel, onSave,
}: { value: ResultValue; busy: boolean; onCancel: () => void; onSave: (body: ValueCheck) => Promise<void> }) {
  const initial = {
    value_text: value.value_text ?? "",
    unit: value.unit ?? "",
    ref_low: value.ref_low ?? "",
    ref_high: value.ref_high ?? "",
    ref_text: value.ref_text ?? "",
  };
  const [fields, setFields] = useState(initial);
  const set = (name: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [name]: e.target.value }));

  function body(): ValueCheck {
    const out: ValueCheck = {};
    if (fields.value_text !== initial.value_text) out.value_text = fields.value_text;
    if (fields.unit !== initial.unit) out.unit = fields.unit;
    if (fields.ref_text !== initial.ref_text) out.ref_text = fields.ref_text;
    if (fields.ref_low !== initial.ref_low) out.ref_low = fields.ref_low.trim() || null;
    if (fields.ref_high !== initial.ref_high) out.ref_high = fields.ref_high.trim() || null;
    return out;
  }

  const inputs: { name: keyof typeof initial; label: string; className: string }[] = [
    { name: "value_text", label: "Value", className: "w-24" },
    { name: "unit", label: "Unit", className: "w-24" },
    { name: "ref_low", label: "Range from", className: "w-20" },
    { name: "ref_high", label: "Range to", className: "w-20" },
    { name: "ref_text", label: "Range as written", className: "w-36" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-warn-line bg-white p-2.5">
      {inputs.map((input) => (
        <label key={input.name} className="flex flex-col gap-1 text-[11px] text-muted">
          {input.label}
          <TextInput className={cn("min-h-8", input.className)} value={fields[input.name]} onChange={set(input.name)} />
        </label>
      ))}
      <ActionButton size="sm" disabled={busy} onClick={() => void onSave(body())}>Save the check</ActionButton>
      <ActionButton variant="quiet" size="sm" onClick={onCancel}>Cancel</ActionButton>
    </div>
  );
}
