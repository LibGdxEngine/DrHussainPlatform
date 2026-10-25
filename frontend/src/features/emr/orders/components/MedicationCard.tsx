import { cn } from "@/lib/utils";
import { Pill } from "@/features/emr/ui/Pill";
import type { Medication } from "../data";

interface MedicationCardProps {
  med: Medication;
  checked: boolean;
  onToggle: () => void;
}

export function MedicationCard({ med, checked, onToggle }: MedicationCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-3.5",
        checked ? "border-brand bg-brand-wash" : "border-line bg-white",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="m-0 size-[18px] flex-none accent-brand" />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <strong dir="ltr" className="text-right text-sm font-semibold">{med.name}</strong>
        <span className="text-[13px] text-muted">{med.sig}</span>
      </span>
      <Pill tone="neutral" size="xs" className="ms-auto flex-none">{med.kind}</Pill>
    </label>
  );
}
