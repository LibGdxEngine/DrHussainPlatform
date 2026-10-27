"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { patientsApi, type Patient } from "@/lib/api/emr/patients";
import { dayKey } from "./schedule";

const noSubscribe = () => () => undefined;

/** Today's day key in the browser's time zone; null while rendering on the server. */
export function useToday(): string | null {
  return useSyncExternalStore(noSubscribe, () => dayKey(new Date()), () => null);
}

export interface Loaded<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/**
 * Runs `load` (memoise it with useCallback) and keeps its answer; a new `load` starts over.
 * Pass null to wait, for example until today's date is known.
 */
export function useLoad<T>(load: (() => Promise<T>) | null, fallback: string): Loaded<T> {
  const [state, setState] = useState<{ load: () => Promise<T>; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ load, data });
      },
      (err: unknown) => {
        if (!cancelled) setState({ load, error: apiErrorMessage(err, fallback) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, fallback]);
  const current = load && state?.load === load ? state : null;
  return { data: current?.data, error: current?.error, loading: !!load && !current };
}

/** Patients matching a name, file number, mobile or email; waits for typing to pause. */
export function usePatientSearch(query: string, limit = 6): { results?: Patient[]; error?: string } {
  const q = query.trim();
  const [state, setState] = useState<{ q: string; results?: Patient[]; error?: string } | null>(null);
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      patientsApi.list({ q, page_size: limit }).then(
        (page) => {
          if (!cancelled) setState({ q, results: page.results });
        },
        (err: unknown) => {
          if (!cancelled) setState({ q, error: apiErrorMessage(err, "Could not search patients.") });
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, limit]);
  const current = state?.q === q && q.length >= 2 ? state : null;
  return { results: current?.results, error: current?.error };
}
