import type { DeliveryChoice } from "../data";

interface DeliveryFieldsetProps {
  legend: string;
  name: string;
  options: { id: DeliveryChoice; label: string }[];
  value: DeliveryChoice;
  onChange: (value: DeliveryChoice) => void;
  /** Choices that cannot be used for this patient, with the reason shown beside them. */
  unavailable?: Partial<Record<DeliveryChoice, string>>;
  children?: React.ReactNode;
}

export function DeliveryFieldset({ legend, name, options, value, onChange, unavailable = {}, children }: DeliveryFieldsetProps) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border border-line px-3.5 py-3 text-sm">
      <legend className="px-1.5 text-[13px] font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2.5">
          <input
            type="radio"
            name={name}
            checked={value === o.id}
            disabled={Boolean(unavailable[o.id])}
            onChange={() => onChange(o.id)}
            className="accent-brand"
          />
          <span className={unavailable[o.id] ? "text-muted" : undefined}>
            {o.label}
            {unavailable[o.id] ? <span className="text-xs"> · {unavailable[o.id]}</span> : null}
          </span>
        </label>
      ))}
      {children}
    </fieldset>
  );
}
