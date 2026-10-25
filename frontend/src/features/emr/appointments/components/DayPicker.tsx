import { cn } from "@/lib/utils";
import { days } from "../data";

/** Title row with the five bookable days; the first (today) is selected. */
export function DayPicker() {
  return (
    <div className="flex items-center gap-4">
      <h1 className="m-0 text-3xl font-bold">المواعيد</h1>
      <div className="ms-auto flex gap-2">
        {days.map((d, i) => {
          const on = i === 0;
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={on || undefined}
              className={cn(
                "flex size-[68px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[20px] text-xs",
                on ? "bg-brand-ink text-white" : "bg-white text-ink",
              )}
            >
              {d.weekday}
              <strong className="text-xl">{d.date}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
