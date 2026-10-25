import { Panel } from "../../ui/Panel";
import { Switch } from "../../ui/Switch";
import { cn } from "@/lib/utils";
import type { ResolvedGroup } from "../types";

interface PermissionMatrixProps {
  roleLabel: string;
  groups: ResolvedGroup[];
  onToggle: (permissionId: string, next: boolean) => void;
  onReset: () => void;
}

export function PermissionMatrix({ roleLabel, groups, onToggle, onReset }: PermissionMatrixProps) {
  const items = groups.flatMap((g) => g.items);
  const onCount = items.filter((i) => i.on).length;

  return (
    <Panel aria-labelledby="pm" className="flex flex-col gap-1.5 p-5">
      <div className="mb-1.5 flex items-center gap-2.5">
        <h2 id="pm" className="m-0 text-lg font-semibold">
          {roleLabel} permissions
        </h2>
        <span className="ms-auto text-xs text-muted">
          {onCount} of {items.length} enabled
        </span>
        <button
          type="button"
          onClick={onReset}
          className="min-h-[34px] cursor-pointer rounded-full border border-line-strong bg-white px-3 text-xs font-semibold hover:border-brand"
        >
          Reset to default
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col">
          <span className="px-1 pb-1.5 pt-3.5 text-xs font-semibold text-muted">{g.name}</span>
          {g.items.map(({ def, locked, on }) => (
            <div
              key={def.id}
              className={cn(
                "flex items-center gap-3 border-b border-line-soft px-1 py-3",
                locked && "opacity-60",
              )}
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{def.label}</span>
                {def.note ? <span className="text-xs text-muted">{def.note}</span> : null}
              </span>
              {locked ? (
                <span className="rounded-full bg-line-soft px-2.5 py-[3px] text-[11px] font-semibold text-ink-3">
                  🔒 Doctor only
                </span>
              ) : (
                <Switch checked={on} onChange={(next) => onToggle(def.id, next)} label={def.label} />
              )}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
