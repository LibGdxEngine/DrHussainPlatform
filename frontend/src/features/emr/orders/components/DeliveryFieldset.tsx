interface DeliveryFieldsetProps {
  legend: string;
  name: string;
  options: string[];
}

export function DeliveryFieldset({ legend, name, options }: DeliveryFieldsetProps) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border border-line px-3.5 py-3 text-sm">
      <legend className="px-1.5 text-[13px] font-semibold">{legend}</legend>
      {options.map((o, i) => (
        <label key={o} className="flex items-center gap-2.5">
          <input type="radio" name={name} defaultChecked={i === 0} className="accent-brand" />
          {o}
        </label>
      ))}
    </fieldset>
  );
}
