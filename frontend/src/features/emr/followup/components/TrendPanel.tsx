"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "../../ui/Panel";
import { metrics, xLabels, type MetricId } from "../data";
import { TrendChart } from "./TrendChart";

/** Metric picker + trend chart. Owns the selected metric. */
export function TrendPanel() {
  const [metricId, setMetricId] = useState<MetricId>("mrs");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  return (
    <Panel aria-labelledby="ch" className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ch" className="m-0 text-xl font-semibold">
          {metric.title}
        </h2>
        <div role="group" aria-label="Metric" className="ms-auto flex gap-1 rounded-full bg-canvas p-1">
          {metrics.map((m) => {
            const on = m.id === metricId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => setMetricId(m.id)}
                className={cn(
                  "min-h-[34px] cursor-pointer rounded-full px-3.5 text-xs",
                  on ? "bg-brand-ink font-semibold text-white" : "text-ink-3",
                )}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
      <TrendChart
        values={metric.values}
        range={{ min: metric.min, max: metric.max }}
        band={{ from: metric.band[0], to: metric.band[1], tone: metric.bandTone }}
        xLabels={xLabels}
        ariaLabel={`${metric.name}: ${metric.values.join(", ")}`}
      />
      <p className="m-0 text-[13px] text-muted">{metric.note} The patient sees the same chart in her form.</p>
    </Panel>
  );
}
