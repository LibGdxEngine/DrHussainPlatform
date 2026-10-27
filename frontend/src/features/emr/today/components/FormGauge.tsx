import { useId } from "react";
import { Panel } from "@/features/emr/ui/Panel";

const RADIUS = 90;
const ARC = Math.PI * RADIUS;
const ARC_PATH = "M20 112 A90 90 0 0 1 200 112";

interface FormGaugeProps {
  /** null while loading. */
  done: number | null;
  pending: number | null;
  error?: string;
}

/** Half-circle completion gauge for today's patient forms: solid arc for done, hatched track for pending. */
export function FormGauge({ done, pending, error }: FormGaugeProps) {
  const hatchId = useId();
  const total = (done ?? 0) + (pending ?? 0);
  const percent = total ? Math.round(((done ?? 0) / total) * 100) : 0;
  return (
    <Panel variant="outline" aria-labelledby="fp" className="flex flex-col gap-2.5 p-5">
      <h2 id="fp" className="m-0 text-lg font-semibold">
        Today&apos;s forms
      </h2>
      <div className="relative mt-2 flex justify-center">
        <svg width="220" height="124" viewBox="0 0 220 124" aria-hidden="true">
          <defs>
            <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="#fff" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-hatch)" strokeWidth="3" />
            </pattern>
          </defs>
          <path d={ARC_PATH} fill="none" stroke={`url(#${hatchId})`} strokeWidth="28" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="28"
            strokeDasharray={`${Math.round((percent / 100) * ARC)} 400`}
          />
        </svg>
        <div className="absolute bottom-0 flex flex-col items-center">
          <span className="text-[38px] font-bold leading-none">{done === null ? "—" : total ? `${percent}%` : "—"}</span>
          <span className="mt-1 text-xs text-muted">{done !== null && !total ? "no forms due" : "complete"}</span>
        </div>
      </div>
      {error ? <p role="alert" className="m-0 text-center text-sm text-danger-ink">{error}</p> : null}
      <div className="mt-auto flex justify-center gap-4 text-[13px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand" />
          Complete {done ?? "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="box-border size-2.5 rounded-full border border-hatch bg-[repeating-linear-gradient(45deg,var(--color-hatch)_0_2px,#fff_2px_4px)]" />
          Pending {pending ?? "—"}
        </span>
      </div>
    </Panel>
  );
}
