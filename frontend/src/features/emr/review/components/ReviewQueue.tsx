"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { reviewApi, type QueueCounts, type QueueGroup, type ResultsCase } from "@/lib/api/emr/review";
import { formatDay } from "../../format";
import { reportTypeLabel } from "../../results/labels";
import { emrRoutes } from "../../routes";
import { ChipGroup } from "../../ui/ChipGroup";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { Table, Td, Th } from "../../ui/Table";
import { caseFlag, caseStatus, queueGroups, routeLabel } from "../labels";

const columns = ["Patient", "Report", "Sample", "Status", "What needs doing", "Updated"];

/** The review queue: the only route by which a results email leaves the clinic. */
export function ReviewQueue() {
  const [group, setGroup] = useState<QueueGroup>("needs_doctor");
  const [cases, setCases] = useState<{ group: QueueGroup; list: ResultsCase[]; total: number } | null>(null);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([reviewApi.list(group), reviewApi.counts()]).then(
      ([page, totals]) => {
        if (cancelled) return;
        setCases({ group, list: page.results, total: page.count });
        setCounts(totals);
      },
      (err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, "Could not load the review queue."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [group]);

  const rows = cases?.group === group ? cases.list : null;
  const notShown = cases?.group === group ? cases.total - cases.list.length : 0;
  const options = queueGroups.map((g) => ({ id: g.id, label: counts ? `${g.label} (${counts[g.id]})` : g.label }));

  return (
    <Panel aria-label="Review queue" className="overflow-hidden">
      <div className="flex flex-col gap-2 p-5">
        <p className="m-0 max-w-[760px] text-[13px] leading-[1.7] text-muted">
          Each uploaded report is read and routed. Reports that are unclear, name a different patient or are an
          abnormal smear come to the doctor with no draft. Nothing is sent until the doctor approves it.
        </p>
        <ChipGroup label="Queue" options={options} value={group} onChange={setGroup} />
      </div>
      {error ? <p role="alert" className="m-0 px-5 pb-4 text-sm text-danger-ink">{error}</p> : null}
      {notShown > 0 ? (
        <p className="m-0 px-5 pb-4 text-[13px] text-muted">
          Showing the newest {rows?.length} of {cases?.total} cases in this queue.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c} tinted>{c}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr><Td colSpan={columns.length} className="text-muted">Loading…</Td></tr>
            ) : null}
            {rows && !rows.length ? (
              <tr><Td colSpan={columns.length} className="text-center text-muted">Nothing here.</Td></tr>
            ) : null}
            {(rows ?? []).map((c) => {
              const s = caseStatus[c.status];
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`${emrRoutes.results}/${c.id}`} className="font-semibold text-ink no-underline hover:text-brand">
                      {c.patient.full_name}
                    </Link>
                    <span className="block font-emr-mono text-xs text-muted">{c.patient.file_number}</span>
                  </Td>
                  <Td className="text-[13px]">
                    {c.report ? (
                      <>
                        {reportTypeLabel[c.report.report_type as keyof typeof reportTypeLabel] ?? c.report.report_type}
                        <span className="block text-xs text-muted">{c.report.document_title}</span>
                      </>
                    ) : (
                      <>
                        Question about a prescription
                        <span className="block text-xs text-muted">{c.question?.subject}</span>
                      </>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px]">
                    {formatDay(c.report ? c.report.collected_on : c.question?.sent_at)}
                  </Td>
                  <Td><Pill tone={s.tone} size="xs">{s.label}</Pill></Td>
                  <Td className="max-w-[360px] text-[13px] text-ink-2">
                    {c.status === "awaiting_plan"
                      ? "Choose the plan for this abnormal smear."
                      : c.flag_reasons.length
                        ? c.flag_reasons.map(caseFlag).join(" ")
                        : routeLabel[c.route] ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px]">{formatDay(c.updated_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}
