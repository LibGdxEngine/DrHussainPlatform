import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import type { Message } from "../data";

export function MessageBubble({ message }: { message: Message }) {
  const fromDoctor = message.from === "doc";
  return (
    <li
      className={cn(
        "flex max-w-[78%] flex-col gap-1.5 rounded-[20px] border px-4 py-3.5",
        fromDoctor ? "self-start border-brand-tint bg-brand-tint" : "self-end border-field bg-white",
      )}
    >
      <span className="text-xs text-muted">
        {message.who} · {message.when}
      </span>
      <span className="text-sm leading-[1.8]">{message.text}</span>
      {message.att.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {message.att.map((a) => (
            <Link
              key={a}
              href={emrRoutes.docs}
              className="inline-flex items-center gap-1.5 rounded-full border border-field bg-white px-3 py-1 text-xs font-semibold text-ink no-underline"
            >
              📎 {a}
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}
