"use client";

import { useEffect, useState } from "react";
import { reviewApi } from "@/lib/api/emr/review";

/** Sidebar count of cases waiting on the doctor: flagged, awaiting a plan, or drafts to approve. */
export function ReviewBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    reviewApi.counts().then(
      (c) => {
        if (!cancelled) setCount(c.needs_doctor + c.ready);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!count) return null;
  return (
    <span className="ms-auto rounded-full bg-brand-deep px-[9px] py-px text-xs font-semibold text-white">{count}</span>
  );
}
