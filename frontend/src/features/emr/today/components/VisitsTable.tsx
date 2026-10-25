import Link from "next/link";
import { cn } from "@/lib/utils";
import { emrRoutes } from "@/features/emr/routes";
import { Panel } from "@/features/emr/ui/Panel";
import { ActionLink } from "@/features/emr/ui/Action";
import { Table, Td, Th } from "@/features/emr/ui/Table";
import { AlertPills, FormStatusPill } from "@/features/emr/ui/StatusPills";
import type { TodayVisit } from "../data";

const columns = ["الوقت", "المريضة", "الزيارة · الأقسام", "الاستمارة", "التنبيهات", "MRS"];

export function VisitsTable({ visits }: { visits: TodayVisit[] }) {
  return (
    <Panel variant="outline" aria-labelledby="tv" className="overflow-hidden">
      <div className="flex items-center px-5 pb-2.5 pt-[18px]">
        <h2 id="tv" className="m-0 text-lg font-semibold">
          زيارات النهارده
        </h2>
        <Link href={emrRoutes.appts} className="ms-auto text-sm font-semibold text-brand hover:text-brand-ink">
          الجدول كامل
        </Link>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
              <Th />
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.time}>
                <Td className="font-emr-mono text-[13px] text-ink-3">{v.time}</Td>
                <Td className="whitespace-nowrap">
                  <strong className="font-semibold">{v.name}</strong>
                  <span className="text-muted">، {v.age}</span>
                </Td>
                <Td className="text-[13px] text-ink-2">{v.visit}</Td>
                <Td>
                  <FormStatusPill status={v.form} />
                </Td>
                <Td>
                  <AlertPills counts={v.alerts} size="sm" empty={v.noAlertsText} />
                </Td>
                <Td className="whitespace-nowrap">
                  <strong className="font-semibold">{v.mrs}</strong>{" "}
                  <span className={cn("text-xs", v.mrsHot ? "text-danger-ink" : "text-muted")}>
                    {v.mrsNote}
                  </span>
                </Td>
                <Td className="text-end">
                  <ActionLink href={v.href} variant="quiet" size="sm" className="whitespace-nowrap">
                    {v.actionLabel}
                  </ActionLink>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}
