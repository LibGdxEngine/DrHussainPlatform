import Image from "next/image";
import Link from "next/link";
import { emrRoutes } from "../routes";
import { Icon } from "../ui/icons";
import { cn } from "@/lib/utils";

function RoundIconLink({
  href,
  label,
  icon,
  dot,
}: {
  href: string;
  label: string;
  icon: "msgs" | "bell";
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex size-11 items-center justify-center rounded-full bg-canvas text-ink"
    >
      <Icon name={icon} />
      {dot ? (
        <span className="absolute end-[11px] top-2.5 size-2 rounded-full border-2 border-canvas bg-danger" />
      ) : null}
    </Link>
  );
}

export function DoctorBadge({ subtitle, mono }: { subtitle: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 ps-1.5">
      <Image
        src="/emr/dr-gohar.webp"
        alt=""
        width={44}
        height={44}
        className="size-11 rounded-full bg-brand-tint object-cover object-[50%_8%]"
      />
      <span className="flex flex-col leading-snug">
        <strong className="text-sm font-semibold">Dr. H. Gohar</strong>
        <span className={cn("text-xs text-muted", mono && "font-emr-mono")}>{subtitle}</span>
      </span>
    </div>
  );
}

interface TopbarProps {
  /** Left slot (title for list pages, search box for the dashboard). */
  start: React.ReactNode;
  showMessages?: boolean;
  doctorSubtitle?: string;
  doctorMono?: boolean;
}

/** White rounded header shared by every EMR screen. */
export function Topbar({ start, showMessages, doctorSubtitle = "Doctor", doctorMono }: TopbarProps) {
  return (
    <header className="flex items-center gap-3 rounded-[22px] bg-white px-4 py-3">
      {start}
      <div className="ms-auto flex items-center gap-2.5">
        {showMessages ? <RoundIconLink href={emrRoutes.msgs} label="Inbox" icon="msgs" /> : null}
        <RoundIconLink href={emrRoutes.today} label="Alerts" icon="bell" dot />
        <DoctorBadge subtitle={doctorSubtitle} mono={doctorMono} />
      </div>
    </header>
  );
}
