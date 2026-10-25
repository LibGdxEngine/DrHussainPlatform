import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "../routes";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";

export type PatientTab = "summary" | "exam" | "orders" | "docs" | "emails" | "trends";

const tabs: { id: PatientTab; label: string; href: string }[] = [
  { id: "summary", label: "Summary", href: emrRoutes.visit },
  { id: "exam", label: "Exam & plan", href: emrRoutes.exam },
  { id: "orders", label: "Orders & prescriptions", href: emrRoutes.orders },
  { id: "docs", label: "Documents", href: emrRoutes.docs },
  { id: "emails", label: "Emails", href: emrRoutes.msgs },
  { id: "trends", label: "Trends & follow-up", href: emrRoutes.followup },
];

interface PatientHeaderProps {
  tab: PatientTab;
  name?: string;
  mrn?: string;
  meta?: string;
  initial?: string;
  /** Red banner pill, e.g. "Red 1". */
  flag?: string;
  /** Trailing action buttons (e.g. new prescription). */
  actions?: React.ReactNode;
}

/** Patient identity card with the six file tabs. Used by screens 04-09. */
export function PatientHeader({
  tab,
  name = "Laila Ahmed, 52",
  mrn = "VC-000142",
  meta,
  initial = "L",
  flag,
  actions,
}: PatientHeaderProps) {
  return (
    <Panel as="header" className="flex flex-col gap-[18px] px-6 pb-0 pt-[22px]">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-[58px] items-center justify-center rounded-full bg-brand-tint text-[22px] font-bold text-brand-deep">
          {initial}
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-bold">
            {name}{" "}
            <span className="font-emr-mono text-sm font-medium text-muted">· {mrn}</span>
          </h1>
          {meta ? <p className="m-0 text-sm text-muted">{meta}</p> : null}
        </div>
        {flag ? (
          <Pill tone="red" size="md" className="ms-auto">
            {flag}
          </Pill>
        ) : null}
        {actions ? <div className="ms-auto flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <nav aria-label="Patient chart" className="flex gap-1">
        {tabs.map((t) => {
          const on = t.id === tab;
          return (
            <Link
              key={t.id}
              href={t.id === "emails" ? `${t.href}?patient=${mrn}` : t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "border-b-[3px] px-4 py-3 text-sm no-underline",
                on
                  ? "border-brand font-semibold text-brand-deep"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </Panel>
  );
}
