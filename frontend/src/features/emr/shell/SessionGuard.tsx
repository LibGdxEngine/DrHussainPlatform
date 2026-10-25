"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { emrRoutes } from "../routes";

/** Sends staff back to sign-in, keeping their place, as soon as the session expires on an open screen. */
export function SessionGuard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const expired = status === "unauthenticated" || Boolean(session?.sessionExpired);

  useEffect(() => {
    if (!expired) return;
    const query = search.toString();
    const back = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`${emrRoutes.signin}?callbackUrl=${encodeURIComponent(back)}`);
  }, [expired, pathname, search, router]);

  return null;
}
