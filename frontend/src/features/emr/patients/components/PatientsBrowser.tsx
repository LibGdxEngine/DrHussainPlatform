"use client";

import { useState } from "react";
import Link from "next/link";
import { emrRoutes } from "@/features/emr/routes";
import { SearchBox } from "@/features/emr/shell/SearchBox";
import { ChipGroup } from "@/features/emr/ui/ChipGroup";
import { Panel } from "@/features/emr/ui/Panel";
import { Table, Td, Th } from "@/features/emr/ui/Table";
import { AlertPills, FormStatusPill } from "@/features/emr/ui/StatusPills";
import {
  filterPatients,
  patientFilters,
  patients,
  totalPatients,
  type PatientFilter,
} from "../data";

const columns = ["المريضة", "رقم الملف", "الأقسام", "تنبيهات مفتوحة", "آخر MRS", "الزيارة الجاية", "الاستمارة"];

/** Searchable, filterable patient list (left column of the patients screen). */
export function PatientsBrowser() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PatientFilter>("all");
  const rows = filterPatients(patients, filter, query);

  return (
    <Panel aria-label="قائمة المرضى" className="overflow-hidden">
      <div className="flex flex-col gap-3.5 p-5">
        <SearchBox
          className="max-w-[460px] flex-none"
          label="بحث عن مريضة"
          placeholder="الاسم أو الموبايل أو رقم الملف"
          value={query}
          onChange={setQuery}
        />
        <ChipGroup label="فلاتر" options={patientFilters} value={filter} onChange={setFilter} />
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
                    {p.age} سنة · <span dir="ltr">{p.phone}</span>
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
        معروض {rows.length} من {totalPatients} · الأسماء والأرقام وهمية
      </p>
    </Panel>
  );
}
