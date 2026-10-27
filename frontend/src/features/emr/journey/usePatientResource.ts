"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";

type Loaded<T> = { patientId: string; data?: T; error?: string; at: number };

export interface PatientResource<T> {
  /** Undefined while loading or after an error. */
  data?: T;
  error?: string;
  /** When the current answer arrived, for "today" comparisons outside render. */
  loadedAt?: number;
  reload: () => void;
  /** Replace the loaded data locally, e.g. with the server's answer to a save. */
  update: (change: (data: T) => T) => void;
}

/**
 * One request for one patient, re-run when the patient changes. `load` must be a module-level
 * function: a new function on every render would refetch forever.
 */
export function usePatientResource<T>(
  patientId: string,
  load: (patientId: string) => Promise<T>,
  fallback: string,
): PatientResource<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load(patientId).then(
      (data) => {
        if (!cancelled) setLoaded({ patientId, data, at: Date.now() });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ patientId, error: apiErrorMessage(err, fallback), at: Date.now() });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [patientId, load, fallback, reloads]);

  const update = useCallback(
    (change: (data: T) => T) =>
      setLoaded((prev) => (prev && prev.data !== undefined ? { ...prev, data: change(prev.data) } : prev)),
    [],
  );
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const current = loaded?.patientId === patientId ? loaded : null;
  return { data: current?.data, error: current?.error, loadedAt: current?.at, reload, update };
}
