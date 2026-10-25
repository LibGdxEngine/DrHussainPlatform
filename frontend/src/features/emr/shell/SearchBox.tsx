"use client";

import { cn } from "@/lib/utils";
import { Icon } from "../ui/icons";

interface SearchBoxProps {
  placeholder: string;
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

/** Pill search field; controlled when value/onChange are provided. */
export function SearchBox({ placeholder, label, value, onChange, className }: SearchBoxProps) {
  return (
    <label className={cn("relative block flex-1", className)}>
      <Icon
        name="search"
        size={18}
        strokeWidth={2}
        className="absolute start-4 top-[13px] text-muted"
      />
      <input
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="min-h-11 w-full rounded-full border-0 bg-canvas ps-[46px] pe-4 text-sm text-ink outline-none"
      />
    </label>
  );
}
