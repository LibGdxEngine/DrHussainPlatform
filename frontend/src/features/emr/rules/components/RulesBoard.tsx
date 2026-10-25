"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChipGroup } from "../../ui/ChipGroup";
import { Panel } from "../../ui/Panel";
import { filterOptions, ruleTotal, rules } from "../data";
import type { RuleFilter } from "../types";
import { MrsBandsRow } from "./MrsBandsRow";
import { RuleRow } from "./RuleRow";
import { RulesHeader } from "./RulesHeader";

const headers = ["ID", "الحقل", "القاعدة (الحد قابل للتعديل)", "المستوى", "الرسالة للدكتور", "شغّال"];

/** Client container: owns filter, edited thresholds, disabled rules and the unsaved-changes count. */
export function RulesBoard() {
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [changes, setChanges] = useState(0);

  const shown = rules.filter((r) => filter === "all" || r.level === filter);

  const setValue = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setChanges((c) => c + 1);
  };

  const toggle = (id: string) => {
    setDisabled((d) => ({ ...d, [id]: !d[id] }));
    setChanges((c) => c + 1);
  };

  return (
    <>
      <RulesHeader changes={changes} />
      <Panel aria-label="القواعد" className="overflow-hidden">
        <ChipGroup
          label="فلاتر"
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          className="flex-nowrap px-5 py-[18px]"
        />
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "border-y border-line bg-canvas-2 px-2 py-2.5 text-start text-xs font-medium text-muted",
                    i === 0 && "ps-5",
                    i === headers.length - 1 && "pe-5",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                a={r.a === null ? null : (values[`${r.id}a`] ?? r.a)}
                b={r.b === null ? null : (values[`${r.id}b`] ?? r.b)}
                enabled={!disabled[r.id]}
                onChangeA={(v) => setValue(`${r.id}a`, v)}
                onChangeB={(v) => setValue(`${r.id}b`, v)}
                onToggle={() => toggle(r.id)}
              />
            ))}
            <MrsBandsRow />
          </tbody>
        </table>
        <p className="m-0 px-5 py-3.5 text-xs text-muted">
          معروض {shown.length} من {ruleTotal} قاعدة. درجات المقاييس (زي MRS بسيط 5، متوسط 9، شديد 16) موجودة في
          &quot;درجات المقاييس&quot; وبتظهر كتسميات مش كتنبيهات.
        </p>
      </Panel>
    </>
  );
}
