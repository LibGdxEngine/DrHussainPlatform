"use client";

import { useEffect, useState } from "react";
import { mailApi } from "@/lib/api/emr/mail";
import { ordersApi } from "@/lib/api/emr/orders";

function useCount(load: () => Promise<number>) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (n) => {
        if (!cancelled) setCount(n);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // The loader is a module-level function; it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return count;
}

function CountPill({ count, label }: { count: number | null; label: string }) {
  if (!count) return null;
  return (
    <span className="ms-auto rounded-full bg-brand-deep px-[9px] py-px text-xs font-semibold text-white">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

const unreadMail = () => mailApi.threads.counts().then((c) => c.unread);
const testsToArrive = () => ordersApi.requested.counts().then((c) => c.pending);

/** Unread patient emails. */
export function InboxBadge() {
  return <CountPill count={useCount(unreadMail)} label="unread" />;
}

/** Requested tests the patients have not brought or sent yet. */
export function ScanBadge() {
  return <CountPill count={useCount(testsToArrive)} label="tests still to arrive" />;
}
