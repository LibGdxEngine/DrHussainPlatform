import { cn } from "@/lib/utils";

interface TestSetButtonProps {
  name: string;
  count: number;
  selected: boolean;
  onAdd: () => void;
}

export function TestSetButton({ name, count, selected, onAdd }: TestSetButtonProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-2xl px-3.5 py-3 text-start",
        selected
          ? "border-[1.5px] border-brand bg-brand-tint text-brand-ink"
          : "border border-field bg-white text-ink hover:border-brand",
      )}
    >
      <strong className="text-[13px] font-semibold">{name}</strong>
      <span className={cn("text-xs", selected ? "text-ok-ink" : "text-muted")}>
        {count} تحاليل{selected ? " ✓" : ""}
      </span>
    </button>
  );
}
