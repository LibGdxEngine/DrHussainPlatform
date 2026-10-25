import Link from "next/link";
import { cn } from "@/lib/utils";
import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { settingsTabs } from "../data";

/** Title, unsaved-changes counter, save button and settings section tabs. */
export function RulesHeader({ changes }: { changes: number }) {
  return (
    <Panel className="flex flex-col gap-[18px] p-6">
      <div className="flex items-start gap-4">
        <div className="flex max-w-[720px] flex-col gap-1.5">
          <span className="text-[13px] text-muted">إعدادات العيادة</span>
          <h1 className="m-0 text-3xl font-bold">قواعد التنبيهات</h1>
          <p className="m-0 text-sm leading-[1.7] text-muted">
            كل قاعدة بتطابق سطر في ملف الاستمارات (R1–R40). غيّر الحد هنا لما الإرشادات تتغير، من غير ما تحتاج
            مبرمج. كل تغيير بيتحفظ له نسخة وبيتسجل.
          </p>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="text-[13px] font-semibold text-warn-ink" aria-live="polite">
            {changes ? `${changes} تغيير مش محفوظ` : ""}
          </span>
          <ActionButton>احفظ التغييرات</ActionButton>
        </div>
      </div>
      <nav aria-label="أقسام الإعدادات" className="flex flex-wrap gap-1.5">
        {settingsTabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[38px] items-center rounded-full px-3.5 text-[13px] no-underline",
              t.current
                ? "bg-brand-tint font-semibold text-brand-ink"
                : "text-ink-3 hover:bg-canvas",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </Panel>
  );
}
