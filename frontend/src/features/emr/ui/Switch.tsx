"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** 44x26 toggle used for alert rules and permissions. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-11 flex-none cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed",
        checked ? "bg-brand" : "bg-line-strong",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-5 rounded-full bg-white transition-all",
          checked ? "start-[23px]" : "start-[3px]",
        )}
      />
    </button>
  );
}
