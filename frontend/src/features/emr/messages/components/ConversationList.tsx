import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { conversations, type AvatarTone, type Conversation } from "../data";

const avatarTones: Record<AvatarTone, string> = {
  brand: "bg-white text-brand-deep",
  warn: "bg-warn-tint text-warn-ink",
  neutral: "bg-line-soft text-ink-3",
};

function ConversationItem({ c }: { c: Conversation }) {
  return (
    <Link
      href={emrRoutes.msgs}
      className={cn(
        "flex gap-3 rounded-2xl p-3 text-ink no-underline",
        c.active ? "bg-brand-tint" : "hover:bg-canvas",
      )}
    >
      <span
        className={cn(
          "flex size-[42px] flex-none items-center justify-center rounded-full font-bold",
          avatarTones[c.tone],
        )}
      >
        {c.initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex">
          <strong className="text-sm font-semibold">{c.name}</strong>
          <span className="ms-auto text-xs text-muted">{c.date}</span>
        </span>
        <span className={cn("text-[13px]", c.unread ? "text-ink-2" : "text-muted")}>{c.preview}</span>
        {c.unread ? (
          <span className="self-start rounded-full bg-brand px-2 py-px text-[11px] font-semibold text-white">
            New reply
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function ConversationList() {
  return (
    <Panel aria-label="Conversations" className="flex flex-col gap-1 px-3.5 py-5">
      <h1 className="m-0 mb-3 px-2 text-[26px] font-bold">Messages</h1>
      {conversations.map((c) => (
        <ConversationItem key={c.name} c={c} />
      ))}
    </Panel>
  );
}
