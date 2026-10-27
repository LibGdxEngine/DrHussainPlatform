import type { LabTest, ResultValue } from "@/lib/api/emr/results";

export interface KeyValue {
  key: string;
  name: string;
  result: string;
  date?: string | null;
  optimal: string;
  /** Outside the clinic's optimal target (shaded, not an alert). */
  out: boolean;
}

export interface LabSeries {
  key: string;
  name: string;
  unit: string;
  points: { date: string; value: number }[];
  /** The clinic's optimal target, when both ends are set. */
  band?: [number, number];
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const keyOf = (v: ResultValue) => v.test?.id ?? `raw:${v.raw_name.trim().toLowerCase()}`;

export function optimalText(test: LabTest | undefined): string {
  if (!test) return "—";
  if (test.optimal_text) return test.optimal_text;
  const lo = num(test.optimal_low);
  const hi = num(test.optimal_high);
  if (lo !== null && hi !== null) return `${lo}–${hi}`;
  if (hi !== null) return `<${hi}`;
  if (lo !== null) return `≥${lo}`;
  return "—";
}

/** Same rule as the documents screen: below the low end, or at or above the high end. */
export function outsideOptimal(test: LabTest | undefined, value: number | null): boolean {
  if (!test || value === null) return false;
  const lo = num(test.optimal_low);
  const hi = num(test.optimal_high);
  return (lo !== null && value < lo) || (hi !== null && value >= hi);
}

/** The latest readable value of each test, most recent first. `values` come oldest first from the API. */
export function latestValues(values: ResultValue[], tests: LabTest[]): KeyValue[] {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const latest = new Map<string, ResultValue>();
  for (const v of values) {
    if (v.unreadable) continue;
    if (!v.value_text && num(v.value_numeric) === null) continue;
    const key = keyOf(v);
    latest.delete(key);
    latest.set(key, v);
  }
  return [...latest.entries()].reverse().map(([key, v]) => {
    const test = v.test ? byId.get(v.test.id) : undefined;
    const value = v.value_text || v.value_numeric || "";
    return {
      key,
      name: v.test?.name ?? v.raw_name,
      result: [value, v.unit].filter(Boolean).join(" "),
      date: v.result_date,
      optimal: optimalText(test),
      out: outsideOptimal(test, num(v.value_numeric)),
    };
  });
}

/** Numeric readings per catalog test, oldest first; only tests with at least two dated readings. */
export function labSeries(values: ResultValue[], tests: LabTest[]): LabSeries[] {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const series = new Map<string, LabSeries>();
  for (const v of values) {
    const n = num(v.value_numeric);
    if (!v.test || v.unreadable || n === null || !v.result_date) continue;
    let s = series.get(v.test.id);
    if (!s) {
      const test = byId.get(v.test.id);
      const lo = num(test?.optimal_low);
      const hi = num(test?.optimal_high);
      s = {
        key: v.test.id,
        name: v.test.name,
        unit: v.unit || test?.default_unit || "",
        points: [],
        band: lo !== null && hi !== null ? [lo, hi] : undefined,
      };
      series.set(v.test.id, s);
    }
    s.points.push({ date: v.result_date, value: n });
  }
  return [...series.values()]
    .map((s) => ({ ...s, points: [...s.points].sort((a, b) => a.date.localeCompare(b.date)) }))
    .filter((s) => s.points.length >= 2);
}
