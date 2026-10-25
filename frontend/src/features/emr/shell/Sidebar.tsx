import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "../routes";
import { Icon, type IconName } from "../ui/icons";
import { ActionLink } from "../ui/Action";
import { Logo } from "./Logo";

export type SidebarKey = "today" | "patients" | "appts" | "docs" | "msgs" | "rules" | "audit";

interface NavItem {
  key: SidebarKey | "logout";
  label: string;
  href: string;
  icon: IconName;
  badge?: string;
}

const mainNav: NavItem[] = [
  { key: "today", label: "اليوم", href: emrRoutes.today, icon: "today" },
  { key: "patients", label: "المرضى", href: emrRoutes.patients, icon: "patients" },
  { key: "appts", label: "المواعيد", href: emrRoutes.appts, icon: "appts" },
  { key: "docs", label: "المستندات", href: emrRoutes.docs, icon: "docs", badge: "3" },
  { key: "msgs", label: "الرسائل", href: emrRoutes.msgs, icon: "msgs", badge: "2" },
];

const generalNav: NavItem[] = [
  { key: "rules", label: "إعدادات العيادة", href: emrRoutes.rules, icon: "settings" },
  { key: "audit", label: "سجل المراجعة", href: emrRoutes.audit, icon: "audit" },
  { key: "logout", label: "تسجيل الخروج", href: emrRoutes.signin, icon: "logout" },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-[46px] items-center gap-3 rounded-[14px] px-3.5 text-[15px] no-underline",
        active
          ? "bg-brand-tint font-semibold text-brand-deep"
          : "font-medium text-muted hover:bg-canvas hover:text-ink",
      )}
    >
      {active ? (
        <span className="absolute inset-y-2.5 -start-4 w-1 rounded bg-brand" />
      ) : null}
      <Icon name={item.icon} />
      {item.label}
      {item.badge ? (
        <span className="ms-auto rounded-full bg-brand-deep px-[9px] py-px text-xs font-semibold text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

interface SidebarProps {
  active: SidebarKey;
  showPromo?: boolean;
}

export function Sidebar({ active, showPromo = true }: SidebarProps) {
  return (
    <aside className="flex w-64 flex-none flex-col gap-1 rounded-3xl bg-white px-4 py-6">
      <Logo className="px-2.5 pb-[26px]" />
      <span className="px-3.5 pb-2 text-xs text-subtle">القائمة</span>
      {mainNav.map((i) => (
        <NavLink key={i.key} item={i} active={i.key === active} />
      ))}
      <span className="px-3.5 pb-2 pt-[22px] text-xs text-subtle">عام</span>
      {generalNav.map((i) => (
        <NavLink key={i.key} item={i} active={i.key === active} />
      ))}
      {showPromo ? (
        <div className="mt-auto flex flex-col gap-2 rounded-[20px] bg-[radial-gradient(120%_90%_at_85%_0%,var(--color-brand-mid)_0%,var(--color-brand-ink)_70%)] px-[18px] py-5 text-white">
          <strong className="text-[17px] font-semibold leading-snug">لينك استمارة المريضة</strong>
          <span className="text-[13px] leading-relaxed text-mint-2">
            ابعت الاستمارة قبل الزيارة عشان تتملي من البيت
          </span>
          <ActionLink href={emrRoutes.patients} variant="white" size="sm" className="mt-1.5 min-h-[42px] text-sm">
            ابعت لينك
          </ActionLink>
        </div>
      ) : null}
    </aside>
  );
}
