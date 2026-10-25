"use client";

import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  id: T;
  label: string;
}

interface ChipGroupProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

/** Single-select pill filters (patients filter, plan choice, metric picker...). */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-[38px] cursor-pointer rounded-full border px-4 text-[13px]",
              on
                ? "border-brand-ink bg-brand-ink font-semibold text-white"
                : "border-field bg-white font-medium text-ink hover:border-brand",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
