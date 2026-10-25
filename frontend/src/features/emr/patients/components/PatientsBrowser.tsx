"use client";

import { useState } from "react";
import Link from "next/link";
import { channelLabel } from "@/features/emr/journey/data";
import { emrRoutes } from "@/features/emr/routes";
import { SearchBox } from "@/features/emr/shell/SearchBox";
import { ChipGroup } from "@/features/emr/ui/ChipGroup";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { Table, Td, Th } from "@/features/emr/ui/Table";
import { AlertPills, FormStatusPill } from "@/features/emr/ui/StatusPills";
import {
  filterPatients,
  patientFilters,
  patients,
  totalPatients,
  type PatientFilter,
} from "../data";

const columns = ["Patient", "File no.", "Modules", "Open alerts", "Last MRS", "Next visit", "Form"];

/** Searchable, filterable patient list (left column of the patients screen). */
export function PatientsBrowser() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PatientFilter>("all");
  const rows = filterPatients(patients, filter, query);

  return (
    <Panel aria-label="Patient list" className="overflow-hidden">
      <div className="flex flex-col gap-3.5 p-5">
        <SearchBox
          className="max-w-[460px] flex-none"
          label="Search patients"
          placeholder="Name, mobile or file number"
          value={query}
          onChange={setQuery}
        />
        <ChipGroup label="Filters" options={patientFilters} value={filter} onChange={setFilter} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c} tinted>
                  {c}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.mrn}>
                <Td>
                  <Link
                    href={emrRoutes.visit}
                    className="font-semibold text-ink no-underline hover:text-brand"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    {p.age} yrs · {p.phone}{" "}
                    <Pill tone={p.channel === "whatsapp" ? "ok" : "neutral"} size="xs" className="ms-1">
                      {channelLabel[p.channel]}
                    </Pill>
                  </div>
                </Td>
                <Td className="font-emr-mono text-xs text-ink-3">{p.mrn}</Td>
                <Td className="text-[13px] text-ink-2">{p.modules}</Td>
                <Td>
                  <AlertPills counts={p.alerts} size="xs" />
                </Td>
                <Td className="whitespace-nowrap text-[13px]">{p.mrs}</Td>
                <Td className="whitespace-nowrap text-[13px]">{p.next}</Td>
                <Td>
                  <FormStatusPill status={p.form} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="m-0 px-5 py-3.5 text-xs text-muted">
        Showing {rows.length} of {totalPatients} · names and numbers are fictitious
      </p>
    </Panel>
  );
}
