import Link from "next/link";
import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { settingsTabs, type SettingsTab } from "../tabs";

interface SettingsHeaderProps {
  tab: SettingsTab;
  title: string;
  description: string;
  /** Save buttons, change counters and similar, shown on the right. */
  actions?: React.ReactNode;
}

/** Title, description and section tabs shared by every clinic settings screen. */
export function SettingsHeader({ tab, title, description, actions }: SettingsHeaderProps) {
  return (
    <Panel className="flex flex-col gap-[18px] p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[720px] flex-col gap-1.5">
          <span className="text-[13px] text-muted">Clinic settings</span>
          <h1 className="m-0 text-3xl font-bold">{title}</h1>
          <p className="m-0 text-sm leading-[1.7] text-muted">{description}</p>
        </div>
        {actions ? <div className="ms-auto flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1.5">
        {settingsTabs.map((t) => {
          const current = t.id === tab;
          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[38px] items-center rounded-full px-3.5 text-[13px] no-underline",
                current ? "bg-brand-tint font-semibold text-brand-ink" : "text-ink-3 hover:bg-canvas",
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
