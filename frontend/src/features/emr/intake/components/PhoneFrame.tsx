import Link from "next/link";
import { cn } from "@/lib/utils";

interface PhoneFrameProps {
  /** Canvas caption above the frame (desktop only). */
  label: string;
  children: React.ReactNode;
}

/**
 * Phone bezel. On desktop it is a fixed 390px device laid out beside its siblings;
 * on a real phone it drops the bezel and fills the screen.
 */
export function PhoneFrame({ label, children }: PhoneFrameProps) {
  return (
    <figure className="m-0 flex w-full max-w-[410px] flex-col gap-2.5 max-sm:max-w-none lg:w-[410px] lg:flex-none">
      <figcaption className="hidden text-[13px] font-semibold text-ink-3 lg:block">{label}</figcaption>
      <div className="flex min-h-[844px] flex-col overflow-hidden rounded-[44px] border-[10px] border-ink bg-canvas max-sm:min-h-screen max-sm:rounded-none max-sm:border-0">
        {children}
      </div>
    </figure>
  );
}

interface StepHeaderProps {
  title: string;
  /** e.g. "خطوة 2 من 9" */
  stepText: string;
  progress: number;
  children?: React.ReactNode;
}

/** White top bar with step title, counter and progress bar. */
export function StepHeader({ title, stepText, progress, children }: StepHeaderProps) {
  return (
    <div className="flex flex-col gap-3 bg-white px-6 pb-4 pt-[22px]">
      <div className="flex items-center">
        <strong className="text-[15px] font-bold text-brand-deep">{title}</strong>
        <span className="ms-auto text-sm text-muted">{stepText}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
      </div>
      {children}
    </div>
  );
}

export function PhoneBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-1 flex-col", className)}>{children}</div>;
}

interface PhoneFooterProps {
  backHref?: string;
  next: { label: string; href: string };
}

const footerButton = "flex items-center justify-center rounded-[18px] no-underline";

/** Sticky white action bar: back (optional) + primary action. */
export function PhoneFooter({ backHref, next }: PhoneFooterProps) {
  return (
    <div className={cn("mt-auto bg-white px-6 pb-[26px] pt-4", backHref ? "grid grid-cols-[1fr_1.6fr] gap-2.5" : "")}>
      {backHref ? (
        <Link
          href={backHref}
          className={cn(footerButton, "min-h-14 border-[1.5px] border-line-strong text-base font-semibold text-ink")}
        >
          رجوع
        </Link>
      ) : null}
      <Link
        href={next.href}
        className={cn(footerButton, "min-h-14 bg-brand text-[17px] font-semibold text-white hover:bg-brand-ink")}
      >
        {next.label}
      </Link>
    </div>
  );
}
