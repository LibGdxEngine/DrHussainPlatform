import { cn } from "@/lib/utils";

/** Colour-coded status pill used for alerts, form status, audit outcomes, roles. */
export type PillTone = "red" | "amber" | "reminder" | "ok" | "neutral" | "danger" | "brand";

const tones: Record<PillTone, string> = {
  red: "bg-danger text-white",
  amber: "bg-warn-tint text-warn-ink",
  reminder: "bg-line-soft text-ink-3",
  neutral: "bg-line-soft text-ink-3",
  ok: "bg-ok-tint text-ok-ink",
  danger: "bg-danger-tint text-danger-ink",
  brand: "bg-brand-tint text-brand-ink",
};

const sizes = {
  xs: "px-[9px] py-[3px] text-[11px]",
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-[13px]",
} as const;

interface PillProps {
  tone?: PillTone;
  size?: keyof typeof sizes;
  className?: string;
  children: React.ReactNode;
}

export function Pill({ tone = "neutral", size = "sm", className, children }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-semibold",
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
