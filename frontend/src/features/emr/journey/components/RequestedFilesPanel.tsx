"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { ordersApi, type RequestedTest, type RequestedTestStatus } from "@/lib/api/emr/orders";
import { formatDay } from "../../format";
import { emrRoutes } from "../../routes";
import { ActionLink } from "../../ui/Action";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { arrivalStatus } from "../data";
import { usePatientResource } from "../usePatientResource";

const loadRequested = (patient: string) => ordersApi.requested.list({ patient });

const linkButton = "cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold disabled:cursor-wait disabled:opacity-60";

interface RequestedFilesPanelProps {
  patientId: string;
  mrn: string;
}

/** Tests the doctor asked the patient to bring, and whether each arrived (clinic scan / email) or was entered. */
export function RequestedFilesPanel({ patientId, mrn }: RequestedFilesPanelProps) {
  const requested = usePatientResource(patientId, loadRequested, "Could not load the requested tests.");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tests = requested.data;
  const arrived = tests?.filter((t) => t.status !== "pending").length ?? 0;
  const scanHref = `${emrRoutes.scan}?patient=${encodeURIComponent(mrn)}`;

  async function mark(test: RequestedTest, status: RequestedTestStatus) {
    setBusyId(test.id);
    setError(null);
    try {
      const saved = await ordersApi.requested.update(test.id, { status });
      requested.update((list) => list.map((t) => (t.id === saved.id ? saved : t)));
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel aria-labelledby="rq" className="flex flex-col p-5">
      <div className="mb-1.5 flex items-center">
        <h2 id="rq" className="m-0 text-lg font-semibold">
          Requested tests
        </h2>
        {tests?.length ? (
          <span className="ms-auto text-xs text-muted">
            {arrived} of {tests.length} received
          </span>
        ) : null}
      </div>
      {requested.error ? (
        <p role="alert" className="m-0 text-[13px] text-danger-ink">{requested.error}</p>
      ) : !tests ? (
        <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : !tests.length ? (
        <p className="m-0 text-[13px] text-muted">No tests requested yet. They appear here when the doctor sends a lab request.</p>
      ) : (
        tests.map((t, i) => {
          const st = arrivalStatus[t.status];
          const busy = busyId === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5 text-sm",
                i < tests.length - 1 && "border-b border-line-soft",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{t.name}</span>
                <span className="text-[11px] text-muted">
                  {t.order_title} · {formatDay(t.requested_at)}
                  {t.arrived_at ? ` · arrived ${formatDay(t.arrived_at)}` : ""}
                </span>
              </span>
              <Pill tone={st.tone} size="xs" className="ms-auto">
                {st.label}
              </Pill>
              <span className="flex w-full gap-3 text-xs">
                {t.status === "pending" ? (
                  <>
                    <Link href={scanHref} className="font-semibold text-brand no-underline">
                      Scan now
                    </Link>
                    <button type="button" disabled={busy} onClick={() => void mark(t, "clinic")} className={cn(linkButton, "text-ink-2")}>
                      Arrived at clinic
                    </button>
                    <button type="button" disabled={busy} onClick={() => void mark(t, "email")} className={cn(linkButton, "text-ink-2")}>
                      Arrived by email
                    </button>
                  </>
                ) : t.status !== "entered" ? (
                  <button type="button" disabled={busy} onClick={() => void mark(t, "pending")} className={cn(linkButton, "text-muted")}>
                    Mark as still waiting
                  </button>
                ) : null}
              </span>
            </div>
          );
        })
      )}
      {error ? (
        <p role="alert" className="m-0 mt-2 text-xs text-danger-ink">{error}</p>
      ) : null}
      <ActionLink href={scanHref} variant="outline" size="sm" className="mt-3">
        Open scanning station for this patient
      </ActionLink>
    </Panel>
  );
}
