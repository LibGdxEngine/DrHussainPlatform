import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { patientsNote, roleInfo, roleOrder } from "../data";

/** What each clinic role can do, as the platform enforces it. */
export function RolesPanel() {
  return (
    <Panel aria-labelledby="rl" className="flex flex-col gap-3 p-5">
      <h2 id="rl" className="m-0 text-lg font-semibold">
        What each role can do
      </h2>
      {roleOrder.map((role) => {
        const info = roleInfo[role];
        return (
          <section key={role} aria-label={info.label} className="flex flex-col gap-2 rounded-2xl bg-canvas-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[15px] font-semibold">{info.label}</strong>
              <Pill tone={role === "MEMBER" ? "neutral" : "brand"} size="xs">{info.short}</Pill>
            </div>
            <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-[13px] leading-[1.6] text-ink-2">
              {info.can.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {info.cannot?.map((c) => (
              <p key={c} className="m-0 text-xs text-muted">{c}</p>
            ))}
          </section>
        );
      })}
      <p className="m-0 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-[1.7] text-muted">{patientsNote}</p>
    </Panel>
  );
}
