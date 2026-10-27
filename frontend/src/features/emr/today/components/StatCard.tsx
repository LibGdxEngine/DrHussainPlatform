import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/features/emr/ui/icons";

export interface TodayStat {
  title: string;
  /** null while loading or when it could not be loaded. */
  value: number | null;
  caption: string;
  href: string;
  /** Set when the number could not be loaded; shown instead of the caption. */
  error?: string;
  /** The first card is the dark "needs attention" card. */
  highlight?: boolean;
}

export function StatCard({ stat }: { stat: TodayStat }) {
  const { highlight } = stat;
  return (
    <Link
      href={stat.href}
      className={cn(
        "flex flex-col gap-2.5 rounded-[22px] p-5 no-underline",
        highlight
          ? "bg-[radial-gradient(130%_120%_at_90%_0%,var(--color-brand-mid)_0%,var(--color-brand-deep)_55%,var(--color-brand-ink)_100%)] text-white"
          : "border border-line text-ink hover:border-brand",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-[15px] font-medium leading-normal">{stat.title}</span>
        <span
          className={cn(
            "ms-auto flex size-9 flex-none items-center justify-center rounded-full",
            highlight ? "bg-white text-brand-ink" : "border border-line-strong",
          )}
        >
          <Icon name="arrowUpRight" size={16} strokeWidth={2} />
        </span>
      </div>
      <span className="text-5xl font-bold leading-none">{stat.value ?? "—"}</span>
      {stat.error ? (
        <span role="alert" className={cn("text-[13px]", highlight ? "text-white" : "text-danger-ink")}>
          {stat.error}
        </span>
      ) : (
        <span className={cn("text-[13px]", highlight ? "text-mint-2" : "text-muted")}>{stat.caption}</span>
      )}
    </Link>
  );
}
