"use client";

import Link from "next/link";
import { emrRoutes } from "../routes";
import { Icon } from "../ui/icons";
import { roleLabel, useMe } from "./useMe";

function RoundIconLink({ href, label, icon }: { href: string; label: string; icon: "msgs" | "bell" }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex size-11 items-center justify-center rounded-full bg-canvas text-ink"
    >
      <Icon name={icon} />
    </Link>
  );
}

/** The signed-in staff member, from the server: never a fixed name. */
export function StaffBadge() {
  const me = useMe();
  const name = me?.name ?? "";
  return (
    <div className="flex items-center gap-2.5 ps-1.5" aria-live="polite">
      <span className="flex size-11 items-center justify-center rounded-full bg-brand-tint text-base font-bold text-brand-deep">
        {name ? name.charAt(0).toUpperCase() : ""}
      </span>
      <span className="flex min-w-24 flex-col leading-snug">
        <strong className="text-sm font-semibold">{name || " "}</strong>
        <span className="text-xs text-muted">{me ? `${roleLabel[me.role]} · ${me.clinic_name}` : " "}</span>
      </span>
    </div>
  );
}

interface TopbarProps {
  /** Left slot (title for list pages, search box for the dashboard). */
  start: React.ReactNode;
  showMessages?: boolean;
}

/** White rounded header shared by every EMR screen. */
export function Topbar({ start, showMessages }: TopbarProps) {
  return (
    <header className="flex items-center gap-3 rounded-[22px] bg-white px-4 py-3">
      {start}
      <div className="ms-auto flex items-center gap-2.5">
        {showMessages ? <RoundIconLink href={emrRoutes.msgs} label="Inbox" icon="msgs" /> : null}
        <RoundIconLink href={`${emrRoutes.today}#alerts`} label="Open alerts" icon="bell" />
        <StaffBadge />
      </div>
    </header>
  );
}
