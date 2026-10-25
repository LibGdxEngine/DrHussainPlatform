"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  initial?: string;
}

/** SMS verification code: one digit per box, auto-advancing. */
export function OtpInput({ length = 6, initial = "" }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, (_, i) => initial[i] ?? ""),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => prev.map((d, i) => (i === index ? digit : d)));
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1}`}
          maxLength={1}
          inputMode="numeric"
          value={d}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          className={cn(
            "h-[58px] w-12 min-w-0 shrink rounded-[14px] border-[1.5px] text-center text-[22px] outline-none",
            d ? "border-brand bg-brand-wash font-semibold" : "border-field bg-white",
          )}
        />
      ))}
    </div>
  );
}
