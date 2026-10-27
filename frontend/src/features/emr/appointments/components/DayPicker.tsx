"use client";

import { cn } from "@/lib/utils";
import { fromDayKey, isDayKey, weekdayShort } from "../schedule";

interface DayPickerProps {
  days: string[];
  selected: string | null;
  /** Booked visits per day; undefined while loading. */
  counts?: Map<string, number>;
  today: string | null;
  onSelect: (day: string) => void;
}

/** Title row with the upcoming days and their visit counts, plus a date field for any other day. */
export function DayPicker({ days, selected, counts, today, onSelect }: DayPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <h1 className="m-0 text-3xl font-bold">Appointments</h1>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {days.map((d) => {
          const on = d === selected;
          const count = counts?.get(d) ?? 0;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${fromDayKey(d).toDateString()}${counts ? `, ${count} ${count === 1 ? "visit" : "visits"}` : ""}`}
              onClick={() => onSelect(d)}
              className={cn(
                "flex h-[76px] w-[68px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[20px] text-xs",
                on ? "bg-brand-ink text-white" : "bg-white text-ink",
              )}
            >
              {d === today ? "Today" : weekdayShort(d)}
              <strong className="text-xl">{fromDayKey(d).getDate()}</strong>
              <span className={cn("text-[11px]", on ? "text-mint-2" : "text-muted")}>
                {counts ? count : "·"}
              </span>
            </button>
          );
        })}
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
          Other day
          <input
            type="date"
            value={selected ?? ""}
            onChange={(e) => {
              if (isDayKey(e.target.value)) onSelect(e.target.value);
            }}
            className="min-h-11 rounded-[14px] border border-field bg-white px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
      </div>
    </div>
  );
}
