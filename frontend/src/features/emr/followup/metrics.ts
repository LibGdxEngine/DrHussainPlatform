import type { MrsPoint } from "@/lib/api/emr/intake";
import { mrsMax } from "../intake/data";
import { formatDay } from "../format";
import type { LabSeries } from "../visit/labValues";

export type BandTone = "danger" | "warn" | "ok";

export interface Metric {
  id: string;
  name: string;
  title: string;
  /** Oldest first. */
  points: { label: string; value: number }[];
  min: number;
  max: number;
  band?: { from: number; to: number; tone: BandTone };
  note: string;
}

/** MRS total at or above this is severe (same band as the patient form). */
export const MRS_SEVERE = 16;

const round = (n: number) => Number(n.toPrecision(3));

/** Axis range around the readings and the target band, with some room above and below. */
export function axisRange(values: number[], band?: [number, number]): { min: number; max: number } {
  const all = band ? [...values, ...band] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  return { min: round(lo >= 0 ? Math.max(0, lo - pad) : lo - pad), max: round(hi + pad) };
}

/** Chart choices: the MRS total first, then each lab test with at least two readings. */
export function buildMetrics(mrs: MrsPoint[], labs: LabSeries[]): Metric[] {
  const metrics: Metric[] = [];
  if (mrs.length) {
    const first = mrs[0].total;
    const last = mrs[mrs.length - 1].total;
    metrics.push({
      id: "mrs",
      name: "MRS total",
      title: mrs.length > 1 ? `MRS total: ${first} → ${last}` : `MRS total: ${first}`,
      points: mrs.map((p) => ({ label: formatDay(p.date), value: p.total })),
      min: 0,
      max: mrsMax,
      band: { from: MRS_SEVERE, to: mrsMax, tone: "danger" },
      note: `Shaded: severe score (${MRS_SEVERE}+).`,
    });
  }
  for (const s of labs) {
    const values = s.points.map((p) => p.value);
    const unit = s.unit ? ` ${s.unit}` : "";
    metrics.push({
      id: s.key,
      name: s.name,
      title: `${s.name}: ${values[0]} → ${values[values.length - 1]}${unit}`,
      points: s.points.map((p) => ({ label: formatDay(p.date), value: p.value })),
      ...axisRange(values, s.band),
      band: s.band ? { from: s.band[0], to: s.band[1], tone: "ok" } : undefined,
      note: s.band ? "Shaded: the clinic's optimal target." : "No optimal target set for this test.",
    });
  }
  return metrics;
}
