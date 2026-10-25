import { cn } from "@/lib/utils";

export type NoticeState = { tone: "ok" | "error"; text: string } | null;

/** Inline save result: green for done, red for a problem the user can act on. */
export function Notice({ notice, className }: { notice: NoticeState; className?: string }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "m-0 rounded-xl px-3 py-2.5 text-[13px]",
        notice.tone === "error" ? "bg-danger-tint text-danger-ink" : "bg-ok-tint text-ok-ink",
        className,
      )}
    >
      {notice.text}
    </p>
  );
}
