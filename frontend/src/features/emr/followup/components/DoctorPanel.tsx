"use client";

import { ordersApi } from "@/lib/api/emr/orders";
import { formatDay } from "../../format";
import { usePatientResource } from "../../journey/usePatientResource";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";

// Newest first, so the first one is the current treatment.
const loadLatestPrescription = async (patient: string) =>
  (await ordersApi.list(patient, "prescription"))[0] ?? null;

/** Current treatment from the latest prescription; the plan itself is written on Exam & plan. */
export function DoctorPanel({ patientId, mrn }: { patientId: string; mrn: string }) {
  const prescription = usePatientResource(patientId, loadLatestPrescription, "Could not load the prescriptions.");
  const latest = prescription.data;
  const q = `?patient=${encodeURIComponent(mrn)}`;

  return (
    <Panel aria-labelledby="dr" className="flex flex-col gap-3.5 p-5">
      <h2 id="dr" className="m-0 text-lg font-semibold">
        Doctor
      </h2>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-canvas-2 p-3.5">
        <span className="text-xs text-muted">Current treatment (latest prescription)</span>
        {prescription.error ? (
          <p role="alert" className="m-0 text-[13px] text-danger-ink">{prescription.error}</p>
        ) : latest === undefined ? (
          <span className="text-[13px] text-muted">Loading…</span>
        ) : !latest ? (
          <span className="text-sm text-muted">No prescription issued yet.</span>
        ) : (
          <>
            {latest.medicines.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-normal">
                {latest.medicines.map((m) => (
                  <li key={m.id}>
                    <strong className="font-semibold">{[m.drug, m.dose].filter(Boolean).join(" ")}</strong>
                    {m.directions ? <span className="text-muted"> · {m.directions}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-muted">The latest prescription lists no medicines.</span>
            )}
            <span className="text-xs text-muted">
              {latest.title} · {formatDay(latest.created_at)}
              {latest.issued_by_name ? ` · ${latest.issued_by_name}` : ""}
            </span>
          </>
        )}
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-ink-2">
        Record this review&apos;s findings, vitals and plan on the Exam &amp; plan screen. A change of treatment is a
        new prescription.
      </p>
      <ActionLink href={`${emrRoutes.exam}${q}`} className="min-h-[50px] w-full">
        Open Exam &amp; plan
      </ActionLink>
      <ActionLink href={`${emrRoutes.orders}${q}`} variant="quiet" className="w-full">
        New prescription
      </ActionLink>
    </Panel>
  );
}
