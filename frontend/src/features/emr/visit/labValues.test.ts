import { describe, expect, it } from "vitest";
import type { LabTest, ResultValue } from "@/lib/api/emr/results";
import { buildMetrics } from "../followup/metrics";
import { labSeries, latestValues } from "./labValues";

const ferritin: LabTest = { id: "t1", code: "FERR", name: "Ferritin", optimal_low: "50", optimal_high: "150" };
const tsh: LabTest = { id: "t2", code: "TSH", name: "TSH", optimal_text: "1–2.5" };

function value(test: LabTest | null, numeric: string | null, date: string | null, extra: Partial<ResultValue> = {}): ResultValue {
  return {
    id: `${test?.id}-${date}`,
    report: "r",
    test: test ? { id: test.id, code: test.code, name: test.name } : null,
    raw_name: test?.name ?? "Unknown",
    value_text: numeric ?? "",
    value_numeric: numeric,
    unit: test === ferritin ? "ng/mL" : "",
    abnormal: false,
    result_date: date,
    comparison: { change: "first", reasons: [], previous: null },
    ...extra,
  };
}

const history = [
  value(ferritin, "32", "2026-07-01"),
  value(tsh, "1.8", "2026-07-01"),
  value(ferritin, "60", "2026-10-03"),
  value(tsh, null, "2026-10-03", { unreadable: true }),
];

describe("latestValues", () => {
  it("keeps the latest readable value per test, most recent first, shading values outside optimal", () => {
    const rows = latestValues([...history, value(ferritin, "160", "2026-10-20")], [ferritin, tsh]);
    expect(rows.map((r) => [r.name, r.result, r.optimal, r.out])).toEqual([
      ["Ferritin", "160 ng/mL", "50–150", true],
      ["TSH", "1.8", "1–2.5", false],
    ]);
  });
});

describe("labSeries and buildMetrics", () => {
  it("charts tests with two or more dated numbers, MRS first", () => {
    const series = labSeries(history, [ferritin, tsh]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ name: "Ferritin", unit: "ng/mL", band: [50, 150] });
    const metrics = buildMetrics(
      [
        { date: "2026-07-01T08:00:00Z", total: 21, somatic: 9, psychological: 8, urogenital: 4 },
        { date: "2026-10-12T08:00:00Z", total: 9, somatic: 4, psychological: 3, urogenital: 2 },
      ],
      series,
    );
    expect(metrics.map((m) => m.title)).toEqual(["MRS total: 21 → 9", "Ferritin: 32 → 60 ng/mL"]);
    expect(metrics[1].min).toBeLessThanOrEqual(32);
    expect(metrics[1].max).toBeGreaterThanOrEqual(150);
  });
});
