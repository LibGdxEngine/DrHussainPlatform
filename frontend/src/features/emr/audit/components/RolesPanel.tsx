import { Panel } from "../../ui/Panel";
import { rolePermissions } from "../data";
import type { PermissionCell, PermissionTone } from "../types";
import { cn } from "@/lib/utils";

const toneClass: Record<PermissionTone, string> = {
  yes: "text-ok-ink",
  no: "text-danger-ink",
  own: "text-warn-ink",
  readOnly: "text-warn-ink",
  na: "text-subtle",
};

const th = "border-b border-line bg-canvas-2 px-2 py-2.5 text-xs font-medium text-muted";

function Cell({ value, className }: { value: PermissionCell; className?: string }) {
  return (
    <td
      className={cn(
        "border-b border-line-soft px-2 py-[11px] text-center font-semibold",
        toneClass[value.tone],
        className,
      )}
    >
      {value.text}
    </td>
  );
}

export function RolesPanel() {
  return (
    <Panel aria-labelledby="rl" className="overflow-hidden">
      <h2 id="rl" className="m-0 px-5 pb-3 pt-5 text-lg font-semibold">
        كل دور يقدر يعمل إيه
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={cn(th, "ps-5 text-start")}>الإجراء</th>
              <th className={th}>دكتور</th>
              <th className={th}>ممرضة</th>
              <th className={th}>موظف</th>
              <th className={cn(th, "pe-5")}>مريضة</th>
            </tr>
          </thead>
          <tbody>
            {rolePermissions.map((r) => (
              <tr key={r.action}>
                <td className="border-b border-line-soft py-[11px] pe-2 ps-5">{r.action}</td>
                <Cell value={r.doctor} />
                <Cell value={r.nurse} />
                <Cell value={r.staff} />
                <Cell value={r.patient} className="pe-5" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
