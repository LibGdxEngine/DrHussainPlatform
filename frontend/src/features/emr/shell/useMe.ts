"use client";

import { useEffect, useState } from "react";
import { staffApi, type Me } from "@/lib/api/emr/staff";

// One request per page load: every screen's top bar and role checks share it.
let pending: Promise<Me> | null = null;

/** The signed-in staff member and their clinic role; null while loading or if it failed. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let cancelled = false;
    pending ??= staffApi.me().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    pending.then((value) => {
      if (!cancelled) setMe(value);
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}

export const roleLabel: Record<Me["role"], string> = {
  OWNER: "Doctor · owner",
  ADMIN: "Doctor · admin",
  MEMBER: "Clinic staff",
};
