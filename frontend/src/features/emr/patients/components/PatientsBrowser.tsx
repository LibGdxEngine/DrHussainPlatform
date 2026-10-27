"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { channelLabel } from "@/features/emr/journey/data";
import { formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { SearchBox } from "@/features/emr/shell/SearchBox";
import { ActionButton } from "@/features/emr/ui/Action";
import { TextInput } from "@/features/emr/ui/Fields";
import { Panel } from "@/features/emr/ui/Panel";
import { Pill } from "@/features/emr/ui/Pill";
import { Table, Td, Th } from "@/features/emr/ui/Table";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { patientsApi, type PatientPage } from "@/lib/api/emr/patients";

const columns = ["Patient", "File no.", "Date of birth", "First contact", "Added"];
const PAGE_SIZE = 20;

interface PatientsBrowserProps {
  /** Changes whenever a patient is added, so the list reloads. */
  refreshKey: number;
}

/** Searchable patient list (left column of the patients screen). */
export function PatientsBrowser({ refreshKey }: PatientsBrowserProps) {
  const [query, setQuery] = useState("");
  const [birthday, setBirthday] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PatientPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      patientsApi
        .list({ q: query.trim() || undefined, date_of_birth: birthday || undefined, page, page_size: PAGE_SIZE })
        .then((result) => {
          // A newer search has started; drop this stale answer.
          if (controller.signal.aborted) return;
          setData(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(apiErrorMessage(err, "Could not load patients."));
        });
    }, query ? 250 : 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, birthday, page, refreshKey]);

  const rows = data?.results ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Panel aria-label="Patient list" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3.5 p-5">
        <SearchBox
          className="max-w-[460px] flex-none"
          label="Search patients"
          placeholder="Name (English or Arabic), mobile, email or file number"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          Born around
          <TextInput
            type="date"
            aria-label="Date of birth"
            className="min-h-11 w-auto"
            value={birthday}
            onChange={(e) => {
              setBirthday(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="m-0 px-5 pb-4 text-sm text-danger-ink">{error}</p>
      ) : null}
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
              <tr key={p.id}>
                <Td>
                  <Link
                    href={`${emrRoutes.visit}?patient=${encodeURIComponent(p.file_number)}`}
                    className="font-semibold text-ink no-underline hover:text-brand"
                  >
                    {p.full_name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    {p.full_name_ar ? <span dir="auto">{p.full_name_ar} · </span> : null}
                    {p.age} yrs{p.mobile ? ` · ${p.mobile}` : ""}
                  </div>
                </Td>
                <Td className="font-emr-mono text-xs text-ink-3">{p.file_number}</Td>
                <Td className="whitespace-nowrap text-[13px]">{formatDay(p.date_of_birth)}</Td>
                <Td>
                  {p.first_contact_channel ? (
                    <Pill tone={p.first_contact_channel === "whatsapp" ? "ok" : "neutral"} size="xs">
                      {channelLabel[p.first_contact_channel]}
                    </Pill>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-[13px]">{formatDay(p.created_at)}</Td>
              </tr>
            ))}
            {data && rows.length === 0 ? (
              <tr>
                <Td colSpan={columns.length} className="text-center text-sm text-muted">
                  {query || birthday
                    ? "No patient matches this search."
                    : "No patients yet. Add the first one on the right."}
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
      <div className="flex items-center gap-3 px-5 py-3.5 text-xs text-muted">
        {data ? `${data.count} ${data.count === 1 ? "file" : "files"}` : "Loading…"}
        {pages > 1 ? (
          <span className="ms-auto flex items-center gap-2">
            <ActionButton variant="quiet" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </ActionButton>
            Page {page} of {pages}
            <ActionButton variant="quiet" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </ActionButton>
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
