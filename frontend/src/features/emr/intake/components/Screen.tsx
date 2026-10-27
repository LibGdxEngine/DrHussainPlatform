import { cn } from "@/lib/utils";

/** The patient's page: full screen on a phone, a centred column on a larger screen. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen sm:px-4 sm:py-8">
      <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col bg-canvas sm:min-h-[720px] sm:rounded-[32px] sm:shadow-frame">
        {children}
      </main>
    </div>
  );
}

interface ScreenHeaderProps {
  clinic: string;
  /** Step title and position; omitted on the opening and status screens. */
  step?: { title: string; index: number; total: number };
  children?: React.ReactNode;
}

/** White top bar: clinic name, then the step title, counter and progress bar. */
export function ScreenHeader({ clinic, step, children }: ScreenHeaderProps) {
  const pct = step ? Math.round(((step.index + 1) / step.total) * 100) : 0;
  return (
    <header className="flex flex-col gap-3 bg-white px-5 pb-4 pt-5 sm:rounded-t-[32px] sm:px-7">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-[30px] flex-none items-center justify-center rounded-full border-[3px] border-brand text-[13px] font-extrabold text-brand"
        >
          {clinic.trim().charAt(0).toUpperCase() || "V"}
        </span>
        <strong className="text-base font-bold">{clinic}</strong>
      </div>
      {step ? (
        <>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-[15px] font-bold text-brand-deep">{step.title}</h1>
            <span className="ms-auto whitespace-nowrap text-sm text-muted">
              Step {step.index + 1} of {step.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Form progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : null}
      {children}
    </header>
  );
}

export function ScreenBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-1 flex-col gap-5 px-5 py-6 sm:px-7", className)}>{children}</div>;
}

interface ScreenFooterProps {
  onBack?: () => void;
  primary?: { label: string; onClick?: () => void; busy?: boolean; type?: "button" | "submit" };
  children?: React.ReactNode;
}

const footerButton = "flex min-h-14 cursor-pointer items-center justify-center rounded-[18px] disabled:cursor-not-allowed disabled:opacity-60";

/** White action bar kept in view at the bottom: back (optional) and the main action. */
export function ScreenFooter({ onBack, primary, children }: ScreenFooterProps) {
  return (
    <footer className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-line-soft bg-white px-5 pb-6 pt-4 sm:rounded-b-[32px] sm:px-7">
      {children}
      {primary || onBack ? (
        <div className={cn(onBack && primary ? "grid grid-cols-[1fr_1.6fr] gap-2.5" : "flex")}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={cn(footerButton, "w-full border-[1.5px] border-line-strong bg-white text-base font-semibold text-ink")}
            >
              Back
            </button>
          ) : null}
          {primary ? (
            <button
              type={primary.type ?? "button"}
              onClick={primary.onClick}
              disabled={primary.busy}
              className={cn(footerButton, "w-full bg-brand text-[17px] font-semibold text-white hover:bg-brand-ink")}
            >
              {primary.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </footer>
  );
}

/** Patient-facing error or notice line. */
export function Notice({ tone = "danger", children }: { tone?: "danger" | "ok" | "info"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "m-0 rounded-2xl px-4 py-3 text-[15px] leading-[1.6]",
        tone === "danger" && "bg-danger-tint text-danger-ink",
        tone === "ok" && "bg-ok-tint text-ok-ink",
        tone === "info" && "bg-brand-tint text-brand-deep",
      )}
    >
      {children}
    </p>
  );
}
