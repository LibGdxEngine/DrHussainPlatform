import { ActionButton } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { actionFilterOptions, auditRows, outcomeLabel, periodOptions, userFilterOptions } from "../data";
import { FilterSelect } from "./FilterSelect";

const th = "border-y border-line bg-canvas-2 px-2 py-2.5 text-start text-xs font-medium text-muted";
const td = "border-b border-line-soft px-2 py-3";

export function AuditLogPanel() {
  return (
    <Panel aria-label="Log" className="overflow-hidden">
      <div className="flex flex-wrap gap-2.5 px-5 py-[18px]">
        <FilterSelect label="Period" options={periodOptions} />
        <FilterSelect label="User" options={userFilterOptions} />
        <FilterSelect label="Action" options={actionFilterOptions} />
        <input
          placeholder="MRN"
          className="min-h-[42px] w-40 rounded-full border border-field px-3.5 text-[13px] outline-none focus:border-brand"
        />
        <ActionButton variant="outline" className="ms-auto min-h-[42px] px-[18px] text-[13px]">
          Export (confirm with Passkey)
        </ActionButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${th} ps-5`}>Time</th>
              <th className={th}>Who</th>
              <th className={th}>Action</th>
              <th className={th}>Patient</th>
              <th className={th}>Details</th>
              <th className={`${th} pe-5`}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {auditRows.map((r) => (
              <tr key={`${r.time}-${r.action}`}>
                <td className={`${td} ps-5 whitespace-nowrap text-xs text-ink-3`}>{r.time}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <strong className="font-semibold">{r.who}</strong>
                  <br />
                  <span className="text-[11px] text-muted">{r.role}</span>
                </td>
                <td className={td}>{r.action}</td>
                <td className={`${td} font-emr-mono text-xs`}>{r.patient}</td>
                <td className={`${td} text-ink-2`}>{r.details}</td>
                <td className={`${td} pe-5`}>
                  <Pill tone={r.outcome === "success" ? "ok" : "danger"} size="xs" className="px-2.5">
                    {outcomeLabel[r.outcome]}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 px-5 py-3.5 text-xs text-muted">
        No one can edit or delete any row. Clinical values and note text are never written to the log.
      </p>
    </Panel>
  );
}
