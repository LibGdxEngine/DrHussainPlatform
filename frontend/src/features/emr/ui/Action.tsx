import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ActionVariant = "primary" | "outline" | "quiet" | "dark" | "white";
export type ActionSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold no-underline transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ActionVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-ink hover:text-white",
  outline: "border-[1.5px] border-brand text-brand hover:bg-brand-wash hover:text-brand",
  quiet: "border border-line-strong text-ink hover:border-brand hover:text-brand",
  dark: "bg-brand-ink text-white hover:bg-ink hover:text-white",
  white: "bg-white text-brand-ink hover:bg-brand-tint hover:text-brand-ink",
};

const sizes: Record<ActionSize, string> = {
  sm: "min-h-9 px-3.5 text-[13px]",
  md: "min-h-[46px] px-5 text-sm",
  lg: "min-h-[52px] px-6 text-[15px]",
};

export function actionClasses(variant: ActionVariant = "primary", size: ActionSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface Shared {
  variant?: ActionVariant;
  size?: ActionSize;
}

/** Navigation action (renders a Next <Link>). */
export function ActionLink({
  variant,
  size,
  className,
  ...props
}: Shared & ComponentProps<typeof Link>) {
  return <Link className={actionClasses(variant, size, className)} {...props} />;
}

/** In-page action (renders a <button>). */
export function ActionButton({
  variant,
  size,
  className,
  type = "button",
  ...props
}: Shared & ComponentProps<"button">) {
  return <button type={type} className={actionClasses(variant, size, className)} {...props} />;
}
