"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  label: string;
  initial?: string;
  onChange?: (code: string) => void;
}

/** Segmented one-time-code field (LTR digits inside an RTL page). */
export function OtpInput({ length = 6, label, initial = "", onChange }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, (_, i) => initial[i] ?? ""),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === index ? value : d));
    setDigits(next);
    onChange?.(next.join(""));
    if (value && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  };

  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
      <legend className="mb-2.5 p-0 text-sm font-semibold">{label}</legend>
      <div dir="ltr" className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={`رقم ${i + 1}`}
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => update(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className={cn(
              "h-16 w-[60px] rounded-2xl border-[1.5px] text-center text-2xl font-semibold text-ink outline-none focus:border-brand",
              d ? "border-brand bg-brand-wash" : "border-field bg-white",
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}
