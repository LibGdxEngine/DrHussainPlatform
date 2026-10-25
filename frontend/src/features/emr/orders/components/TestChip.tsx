interface TestChipProps {
  name: string;
  checked: boolean;
  onToggle: () => void;
}

export function TestChip({ name, checked, onToggle }: TestChipProps) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-field bg-canvas-2 px-3 text-[13px]">
      <input type="checkbox" checked={checked} onChange={onToggle} className="m-0 size-4 accent-brand" />
      <span dir="ltr">{name}</span>
    </label>
  );
}
