import { cn } from "@/lib/utils";

interface LogoProps {
  /** "sidebar" shows the EMR suffix, "hero" is the larger sign-in variant. */
  size?: "sidebar" | "hero";
  className?: string;
}

export function Logo({ size = "sidebar", className }: LogoProps) {
  const hero = size === "hero";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-full border-[3px] border-brand font-extrabold text-brand",
          hero ? "size-10 text-[17px]" : "size-[38px] text-base",
        )}
      >
        V
      </span>
      <span className={cn("font-bold", hero ? "text-[21px]" : "text-[19px]")}>
        V-Clinic
        {hero ? null : <span className="ms-1 text-sm font-normal text-muted">EMR</span>}
      </span>
    </div>
  );
}
