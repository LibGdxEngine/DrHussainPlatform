import { cn } from "@/lib/utils";
import type { Option } from "../types";

const selectedStyle = "border-2 border-brand bg-brand-tint font-semibold text-brand-ink";
const idleStyle = "border border-field bg-white text-ink";

interface ToggleChipProps {
  selected: boolean;
  onClick: () => void;
  size?: "md" | "lg";
  children: React.ReactNode;
}

/** Multi-select pill (visit reasons, side effects). */
export function ToggleChip({ selected, onClick, size = "lg", children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full text-start text-sm",
        size === "lg" ? "min-h-12 px-4" : "min-h-11 px-3.5",
        selected ? selectedStyle : idleStyle,
      )}
    >
      {selected ? "✓ " : null}
      {children}
    </button>
  );
}

interface ChoiceGroupProps<T extends string> {
  options: Option<T>[];
  /** undefined until the patient answers. */
  value: T | undefined;
  onChange: (id: T) => void;
  label: string;
  columns: 2 | 3;
  size?: "md" | "lg";
}

/** Equal-width single-select buttons (yes/no, overall feeling, adherence). */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  columns,
  size = "md",
}: ChoiceGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-3")}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            "cursor-pointer rounded-[14px] px-2 text-[15px]",
            size === "md" ? "min-h-12" : "min-h-[50px]",
            o.id === value ? selectedStyle : idleStyle,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface RadioListProps<T extends string> {
  options: Option<T>[];
  value: T | undefined;
  onChange: (id: T) => void;
  label: string;
}

/** Vertical radio rows with a drawn radio dot. */
export function RadioList<T extends string>({ options, value, onChange, label }: RadioListProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-2xl px-4 text-start text-[15px]",
              on ? selectedStyle : idleStyle,
            )}
          >
            <span
              className={cn(
                "size-5 flex-none rounded-full bg-white",
                on ? "border-[6px] border-brand" : "border-[1.5px] border-[#9aa59f]",
              )}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Question label + control stack used inside phone forms. */
export function Question({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-[15px] font-semibold leading-[1.6]">{label}</span>
      {children}
    </div>
  );
}

export const phoneInputClass =
  "min-h-[52px] w-full rounded-2xl border-[1.5px] border-field bg-white px-3.5 text-base outline-none focus:border-brand";

export const phoneTextareaClass =
  "w-full rounded-2xl border-[1.5px] border-field bg-white px-3.5 py-3 text-base leading-[1.7] outline-none focus:border-brand";

/** Card around questions that only show because of an earlier answer. */
export function ConditionalCard({ reason, children }: { reason: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-white p-4">
      <span className="self-start rounded-full bg-brand-tint px-2.5 py-[3px] text-[11px] font-semibold text-ok-ink">
        {reason}
      </span>
      {children}
    </div>
  );
}
