"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MrsPoint } from "@/lib/api/emr/intake";
import { resultsApi } from "@/lib/api/emr/results";
import { usePatientResource } from "../../journey/usePatientResource";
import { Panel } from "../../ui/Panel";
import { labSeries } from "../../visit/labValues";
import { buildMetrics } from "../metrics";
import { TrendChart } from "./TrendChart";

const loadLabSeries = async (patient: string) => {
  const [values, tests] = await Promise.all([resultsApi.history(patient), resultsApi.tests()]);
  return labSeries(values.results, tests);
};

interface TrendPanelProps {
  patientId: string;
  /** MRS totals over time, oldest first; undefined while loading. */
  mrs?: MrsPoint[];
  mrsError?: string;
}

/** Metric picker + trend chart: MRS from the patient's forms, then lab tests with two or more readings. */
export function TrendPanel({ patientId, mrs, mrsError }: TrendPanelProps) {
  const labs = usePatientResource(patientId, loadLabSeries, "Could not load the lab results.");
  const [metricId, setMetricId] = useState("mrs");
  const settled = (mrs || mrsError) && (labs.data || labs.error);
  const list = settled ? buildMetrics(mrs ?? [], labs.data ?? []) : undefined;
  const metric = list?.find((m) => m.id === metricId) ?? list?.[0];
  const errors = [mrsError, labs.error].filter(Boolean);

  return (
    <Panel aria-labelledby="ch" className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ch" className="m-0 text-xl font-semibold">
          {metric?.title ?? "Trends"}
        </h2>
        {list && list.length > 1 ? (
          <div role="group" aria-label="Metric" className="ms-auto flex flex-wrap gap-1 rounded-[20px] bg-canvas p-1">
            {list.map((m) => {
              const on = m.id === metric?.id;
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
        ) : null}
      </div>
      {errors.map((e) => (
        <p key={e} role="alert" className="m-0 text-[13px] text-danger-ink">{e}</p>
      ))}
      {!list ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !metric ? (
        errors.length ? null : (
          <p className="m-0 text-[13px] text-muted">
            Nothing to chart yet. MRS scores come from completed patient forms; lab trends need two dated results of the same test.
          </p>
        )
      ) : (
        <>
          <TrendChart
            points={metric.points}
            range={{ min: metric.min, max: metric.max }}
            band={metric.band}
            ariaLabel={`${metric.name}: ${metric.points.map((p) => `${p.value} on ${p.label}`).join(", ")}`}
          />
          <p className="m-0 text-[13px] text-muted">{metric.note}</p>
        </>
      )}
    </Panel>
  );
}
