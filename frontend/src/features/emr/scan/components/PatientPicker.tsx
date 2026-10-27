"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@/features/emr/ui/Fields";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";
import type { ScanPatient } from "../data";

interface PatientPickerProps {
  label: string;
  onPick: (patient: ScanPatient) => void;
  placeholder?: string;
  className?: string;
  /** Smaller controls for table rows. */
  compact?: boolean;
}

/** Search any patient by name, file number, mobile or email, then pick one. */
export function PatientPicker({ label, onPick, placeholder = "Name or file number", className, compact = false }: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; results: Patient[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      patientsApi.list({ q, page_size: 6 }).then(
        (page) => {
          if (controller.signal.aborted) return;
          setFound({ query: q, results: page.results });
          setError(null);
        },
        (err: unknown) => {
          if (!controller.signal.aborted) setError(apiErrorMessage(err, "Could not search patients."));
        },
      );
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  const results = q && found?.query === q ? found.results : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <TextInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={compact ? "min-h-9 text-[13px]" : undefined}
      />
      {error && q ? <span role="alert" className="text-xs text-danger-ink">{error}</span> : null}
      {results && results.length === 0 ? <span className="text-xs text-muted">No patient matches.</span> : null}
      {results && results.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label={`${label} results`}>
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: p.id, file_number: p.file_number, full_name: p.full_name });
                  setQuery("");
                }}
                className="flex w-full cursor-pointer flex-col items-start rounded-lg border-0 bg-canvas px-2.5 py-1.5 text-start text-[13px] text-ink hover:bg-brand-tint"
              >
                <span className="font-semibold">{p.full_name}</span>
                <span className="font-emr-mono text-[11px] text-muted">
                  {p.file_number}
                  {p.full_name_ar ? ` · ${p.full_name_ar}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
