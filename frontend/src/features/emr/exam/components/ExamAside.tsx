import { cn } from "@/lib/utils";
import { emrRoutes } from "../../routes";
import { ActionButton, ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { autoCalcRows, screeningItems, type ScreeningItem } from "../data";

function ScreeningRow({ item, last }: { item: ScreeningItem; last: boolean }) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 py-2.5 text-sm",
        !last && "border-b border-line-soft",
        item.disabled && "text-subtle",
      )}
    >
      <input
        type="checkbox"
        defaultChecked={item.checked}
        disabled={item.disabled}
        className="size-[18px] accent-brand"
      />
      {item.label}
      {item.note ? (
        <span
          className={cn(
            "ms-auto text-xs",
            item.noteTone === "danger" ? "text-danger-ink" : "text-muted",
            item.noteMono && "font-emr-mono",
          )}
        >
          {item.note}
        </span>
      ) : null}
    </label>
  );
}

function ScreeningPanel() {
  return (
    <Panel aria-labelledby="sc" className="flex flex-col gap-1 p-5">
      <h2 id="sc" className="m-0 mb-2 text-lg font-semibold">
        Screening checklist
      </h2>
      {screeningItems.map((item, i) => (
        <ScreeningRow key={item.label} item={item} last={i === screeningItems.length - 1} />
      ))}
    </Panel>
  );
}

function AutoCalcPanel() {
  return (
    <Panel
      aria-labelledby="ac"
      className="flex flex-col gap-3 bg-[linear-gradient(160deg,#e4f2e9_0%,#cde6d7_100%)] p-5"
    >
      <h2 id="ac" className="m-0 text-lg font-semibold">
        Auto-calculated
      </h2>
      {autoCalcRows.map((r) => (
        <div key={r.label} className="flex items-center rounded-[14px] bg-white px-3.5 py-3 text-sm">
          <span className={cn(r.mono && "font-emr-mono")}>{r.label}</span>
          {r.strong ? (
            <strong className="ms-auto text-[17px] font-bold">{r.value}</strong>
          ) : (
            <span className="ms-auto text-[13px] text-muted">{r.value}</span>
          )}
        </div>
      ))}
    </Panel>
  );
}

/** Right column of the exam screen: static checklist, auto-calculated values and save actions. */
export function ExamAside() {
  return (
    <div className="flex flex-col gap-4">
      <ScreeningPanel />
      <AutoCalcPanel />
      <div className="flex gap-2.5">
        <ActionLink href={emrRoutes.orders} size="lg" className="min-h-[50px] flex-1 text-sm">
          Save and go to orders
        </ActionLink>
        <ActionButton variant="outline" size="lg" className="min-h-[50px] bg-white px-6 text-sm">
          Save
        </ActionButton>
      </div>
    </div>
  );
}
