import { cn } from "@/lib/utils";

interface MedicationCardProps {
  drug: string;
  dose?: string;
  directions?: string;
  checked: boolean;
  onToggle: () => void;
}

/** One item of the clinic's prescription list; ticking adds it to this prescription. */
export function MedicationCard({ drug, dose, directions, checked, onToggle }: MedicationCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-3.5",
        checked ? "border-brand bg-brand-wash" : "border-line bg-white",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="m-0 size-[18px] flex-none accent-brand" />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <strong className="text-sm font-semibold">
          {drug}
          {dose ? <span className="font-normal"> · {dose}</span> : null}
        </strong>
        {directions ? <span className="text-[13px] text-muted">{directions}</span> : null}
      </span>
    </label>
  );
}
