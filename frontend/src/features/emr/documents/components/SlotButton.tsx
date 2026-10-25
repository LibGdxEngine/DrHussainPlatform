import { cn } from "@/lib/utils";

interface SlotButtonProps {
  name: string;
  count: string;
  active: boolean;
  onPick: () => void;
}

export function SlotButton({ name, count, active, onPick }: SlotButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        "flex min-h-11 cursor-pointer items-center rounded-xl border-0 px-3 text-start text-sm",
        active ? "bg-brand-tint font-semibold text-brand-ink" : "bg-transparent text-ink-2 hover:bg-canvas",
      )}
    >
      {name}
      <span
        className={cn(
          "ms-auto text-xs",
          active ? "rounded-full bg-white px-2 py-px" : "text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
