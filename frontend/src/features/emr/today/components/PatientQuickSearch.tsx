"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePatientSearch } from "@/features/emr/appointments/hooks";
import { formatDay } from "@/features/emr/format";
import { emrRoutes } from "@/features/emr/routes";
import { SearchBox } from "@/features/emr/shell/SearchBox";

/** Top bar search: matching patients open their visit page. */
export function PatientQuickSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const { results, error } = usePatientSearch(query);
  const open = query.trim().length >= 2;
  return (
    <div className={cn("relative flex-1", className)}>
      <SearchBox
        label="Search patients"
        placeholder="Search by name, mobile, email or file number"
        value={query}
        onChange={setQuery}
      />
      {open && (results || error) ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 rounded-[18px] border border-line bg-white p-1.5 shadow-lg">
          {error ? <p role="alert" className="m-0 px-3 py-2 text-sm text-danger-ink">{error}</p> : null}
          {results && results.length === 0 ? (
            <p className="m-0 px-3 py-2 text-sm text-muted">No patient matches.</p>
          ) : null}
          {results?.map((p) => (
            <Link
              key={p.id}
              href={`${emrRoutes.visit}?patient=${encodeURIComponent(p.file_number)}`}
              className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2 text-ink no-underline hover:bg-brand-wash"
            >
              <strong className="text-sm font-semibold">
                {p.full_name}
                {p.full_name_ar ? <span dir="auto" className="font-normal text-muted"> · {p.full_name_ar}</span> : null}
              </strong>
              <span className="text-xs text-muted">
                <span className="font-emr-mono">{p.file_number}</span> · born {formatDay(p.date_of_birth)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
