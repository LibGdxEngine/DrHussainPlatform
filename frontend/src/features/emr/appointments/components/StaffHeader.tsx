import { Icon } from "../../ui/icons";
import { Panel } from "../../ui/Panel";

/** Staff-role banner and signed-in staff badge (replaces the doctor top bar on this screen). */
export function StaffHeader() {
  return (
    <Panel as="header" className="flex items-center gap-3 rounded-[22px] px-4 py-3">
      <span className="flex items-center gap-2 rounded-full bg-brand-tint px-3.5 py-2 text-[13px] text-ok-ink">
        <Icon name="audit" size={16} strokeWidth={2} />
        Signed in as clinic staff · you can book visits, send forms, scan files and send requests. Medical notes and
        alerts are doctor-only.
      </span>
      <div className="ms-auto flex items-center gap-2.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-warn-tint font-bold text-warn-ink">
          M
        </span>
        <span className="flex flex-col leading-snug">
          <strong className="text-sm font-semibold">Mai Samir</strong>
          <span className="text-xs text-muted">Clinic staff</span>
        </span>
      </div>
    </Panel>
  );
}
