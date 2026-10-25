import { cn } from "@/lib/utils";
import type { AlertRule } from "@/lib/api/emr/content";
import { formatDay } from "../../format";
import { Pill, type PillTone } from "../../ui/Pill";
import { Switch } from "../../ui/Switch";
import { levelLabel } from "../data";
import type { RuleLevel } from "../types";

const levelTone: Record<RuleLevel, PillTone> = { red: "red", amber: "amber", reminder: "reminder" };

export const cell = "border-b border-line-soft px-2 py-2.5";

const thresholdInput =
  "min-h-8 rounded-[10px] border border-hatch bg-brand-wash text-center text-[13px] font-semibold outline-none focus:border-brand";

export function ThresholdInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("w-14", thresholdInput, className)} {...props} />;
}

interface RuleRowProps {
  rule: AlertRule;
  a: string | null;
  b: string | null;
  enabled: boolean;
  edited: boolean;
  onChangeA: (value: string) => void;
  onChangeB: (value: string) => void;
  onToggle: () => void;
}

/** One alert rule: id, field, editable sentence, level, doctor message, on/off. */
export function RuleRow({ rule, a, b, enabled, edited, onChangeA, onChangeB, onToggle }: RuleRowProps) {
  return (
    <tr className={cn(!enabled && "opacity-50", edited && "bg-warn-wash")}>
      <td className={cn(cell, "ps-5 font-emr-mono text-xs font-medium")}>
        {rule.code}
        <span
          className="block text-[11px] font-normal text-subtle"
          title={rule.changed_at ? `Changed ${formatDay(rule.changed_at)}${rule.changed_by_name ? ` by ${rule.changed_by_name}` : ""}` : undefined}
        >
          v{rule.version}
        </span>
      </td>
      <td className={cell}>{rule.field}</td>
      <td className={cell}>
        <div className="flex flex-wrap items-center gap-1.5 text-ink-2">
          {rule.pre}
          {a !== null ? (
            <ThresholdInput value={a} onChange={(e) => onChangeA(e.target.value)} aria-label={`${rule.code} cut-off`} />
          ) : null}
          {rule.mid}
          {b !== null ? (
            <ThresholdInput value={b} onChange={(e) => onChangeB(e.target.value)} aria-label={`${rule.code} second cut-off`} />
          ) : null}
          {rule.post}
        </div>
      </td>
      <td className={cell}>
        <Pill tone={levelTone[rule.level]} size="xs">
          {levelLabel[rule.level]}
        </Pill>
      </td>
      <td className={cn(cell, "text-ink-2")}>{rule.message}</td>
      <td className={cn(cell, "pe-5")}>
        <Switch checked={enabled} onChange={onToggle} label={`Enable ${rule.code}`} />
      </td>
    </tr>
  );
}
