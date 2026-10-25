import { cn } from "@/lib/utils";
import { Pill, type PillTone } from "../../ui/Pill";
import { Switch } from "../../ui/Switch";
import { levelLabel } from "../data";
import type { Rule, RuleLevel } from "../types";

const levelTone: Record<RuleLevel, PillTone> = { red: "red", amb: "amber", rem: "reminder" };

export const cell = "border-b border-line-soft px-2 py-2.5";

const thresholdInput =
  "min-h-8 rounded-[10px] border border-hatch bg-brand-wash text-center text-[13px] font-semibold outline-none focus:border-brand";

export function ThresholdInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("w-14", thresholdInput, className)} {...props} />;
}

interface RuleRowProps {
  rule: Rule;
  a: string | null;
  b: string | null;
  enabled: boolean;
  onChangeA: (value: string) => void;
  onChangeB: (value: string) => void;
  onToggle: () => void;
}

/** One alert rule: id, field, editable sentence, level, doctor message, on/off. */
export function RuleRow({ rule, a, b, enabled, onChangeA, onChangeB, onToggle }: RuleRowProps) {
  return (
    <tr className={cn(!enabled && "opacity-50")}>
      <td className={cn(cell, "ps-5 font-emr-mono text-xs font-medium")}>{rule.id}</td>
      <td className={cell}>{rule.field}</td>
      <td className={cell}>
        <div className="flex flex-wrap items-center gap-1.5 text-ink-2">
          {rule.pre}
          {a !== null ? (
            <ThresholdInput value={a} onChange={(e) => onChangeA(e.target.value)} aria-label="الحد" />
          ) : null}
          {rule.mid}
          {b !== null ? (
            <ThresholdInput value={b} onChange={(e) => onChangeB(e.target.value)} aria-label="الحد التاني" />
          ) : null}
          {rule.post}
        </div>
      </td>
      <td className={cell}>
        <Pill tone={levelTone[rule.level]} size="xs">
          {levelLabel[rule.level]}
        </Pill>
      </td>
      <td className={cn(cell, "text-ink-2")}>{rule.msg}</td>
      <td className={cn(cell, "pe-5")}>
        <Switch checked={enabled} onChange={onToggle} label="تشغيل القاعدة" />
      </td>
    </tr>
  );
}
