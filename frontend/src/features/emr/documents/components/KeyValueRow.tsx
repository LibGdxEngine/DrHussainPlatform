import { cn } from "@/lib/utils";
import { isOutOfRange, type KeyValueDef } from "../data";

interface KeyValueRowProps {
  def: KeyValueDef;
  value: string;
  onChange: (value: string) => void;
}

const cols = "grid grid-cols-[1.3fr_1fr_1fr] gap-2";

export function KeyValueHeader() {
  return (
    <div className={cn(cols, "px-1 text-xs text-muted")}>
      <span>Test</span>
      <span>Value</span>
      <span>Optimal target</span>
    </div>
  );
}

export function KeyValueRow({ def, value, onChange }: KeyValueRowProps) {
  const id = `kv-${def.id}`;
  const out = isOutOfRange(def, value);
  return (
    <div className={cn(cols, "items-center")}>
      <label htmlFor={id} className="flex flex-col text-[13px] font-semibold">
        <span>{def.name}</span>
        <span className="text-[11px] font-normal text-muted">{def.unit}</span>
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-10 w-full rounded-xl border px-3 text-sm font-semibold outline-none focus:border-brand",
          out ? "border-warn-line bg-warn-tint" : "border-field bg-white",
        )}
      />
      <span className="text-xs leading-normal text-ink-2">{def.optimal || "—"}</span>
    </div>
  );
}
