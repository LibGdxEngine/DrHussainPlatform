interface MenuPreviewProps {
  roleLabel: string;
  menu: string[];
  shift: string;
}

/** Live preview of the sidebar entries the invited role will see. */
export function MenuPreview({ roleLabel, menu, shift }: MenuPreviewProps) {
  return (
    <section
      aria-labelledby="sw"
      className="flex flex-col gap-3 rounded-3xl bg-linear-to-br from-mint-1 to-mint-2 p-5"
    >
      <h2 id="sw" className="m-0 text-[17px] font-semibold">
        Menu for {roleLabel}
      </h2>
      <div className="flex flex-wrap gap-2">
        {menu.map((m) => (
          <span
            key={m}
            className="inline-flex min-h-[34px] items-center rounded-full bg-white px-3.5 text-[13px] font-medium"
          >
            {m}
          </span>
        ))}
      </div>
      <span className="text-xs text-ink-2">
        Shifts: <strong>{shift}</strong>
      </span>
    </section>
  );
}
