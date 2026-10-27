"use client";

import { useEffect, useState } from "react";
import { formatDay } from "@/features/emr/format";
import { SelectInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { ordersApi, type RequestedTest, type RequestedTestUpdate } from "@/lib/api/emr/orders";
import { arrivalLabel, localDay, scanChecklist, type ScanPatient } from "../data";

interface RequestedTestsPanelProps {
  patient: ScanPatient;
  /** Files saved in this session, offered for linking to an arrived test. */
  uploads: { id: string; title: string }[];
}

/** The doctor's requested tests for this patient; reception ticks what the patient brought. */
export function RequestedTestsPanel({ patient, uploads }: RequestedTestsPanelProps) {
  const [tests, setTests] = useState<RequestedTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ordersApi.requested.list({ patient: patient.id }).then(
      (list) => {
        if (!cancelled) setTests(scanChecklist(list, localDay(new Date())));
      },
      (err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, "Could not load the requested tests."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  async function change(test: RequestedTest, body: RequestedTestUpdate) {
    setBusy(test.id);
    setError(null);
    try {
      const saved = await ordersApi.requested.update(test.id, body);
      setTests((list) => (list ?? []).map((t) => (t.id === saved.id ? saved : t)));
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the change."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel aria-labelledby="sc" className="flex flex-col gap-2 p-5">
      <h2 id="sc" className="m-0 text-base font-semibold">Requested by the doctor</h2>
      {error ? (
        <p role="alert" className="m-0 rounded-xl bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">{error}</p>
      ) : null}
      {tests === null ? (
        error ? null : <p className="m-0 text-[13px] text-muted">Loading…</p>
      ) : tests.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No tests are waiting for this patient.</p>
      ) : (
        tests.map((t) => {
          const arrived = t.status !== "pending";
          // Only a tick made at the clinic can be undone here.
          const fixed = t.status === "email" || t.status === "entered";
          return (
            <div key={t.id} className="flex flex-col gap-1.5 border-b border-line-soft py-1.5">
              <label className="flex min-h-9 items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={arrived}
                  disabled={busy === t.id || fixed}
                  onChange={() => void change(t, { status: arrived ? "pending" : "clinic" })}
                  className="size-[17px] accent-brand"
                />
                <span className="flex min-w-0 flex-col">
                  {t.name}
                  <span className="text-[11px] text-muted">
                    {t.order_title} · {formatDay(t.requested_at)}
                  </span>
                </span>
                {arrived ? (
                  <Pill tone="brand" size="xs" className="ms-auto">{arrivalLabel[t.status]}</Pill>
                ) : null}
              </label>
              {t.status === "clinic" && uploads.length > 0 ? (
                <SelectInput
                  aria-label={`File for ${t.name}`}
                  value={uploads.some((u) => u.id === t.document) ? (t.document ?? "") : ""}
                  disabled={busy === t.id}
                  onChange={(e) => void change(t, { document: e.target.value || null })}
                  className="min-h-9 text-[13px]"
                >
                  <option value="">{t.document ? "Linked to an earlier file" : "Link a scanned file…"}</option>
                  {uploads.map((u) => (
                    <option key={u.id} value={u.id}>{u.title}</option>
                  ))}
                </SelectInput>
              ) : null}
            </div>
          );
        })
      )}
      <p className="m-0 mt-1 text-xs leading-[1.7] text-muted">
        Tick what the patient brought. Anything missing stays visible to the doctor in the visit summary.
      </p>
    </Panel>
  );
}
