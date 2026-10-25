interface FilterSelectProps {
  label: string;
  options: string[];
}

/** Rounded pill select used in the audit filter bar. */
export function FilterSelect({ label, options }: FilterSelectProps) {
  return (
    <select
      aria-label={label}
      className="min-h-[42px] rounded-full border border-field bg-white px-3.5 text-[13px] outline-none focus:border-brand"
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
