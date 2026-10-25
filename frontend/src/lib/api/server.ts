import "server-only";

import { createApiClient } from "./client";
import { headers } from "next/headers";
import { context, propagation } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { currentRequestId, validRequestId } from "@/lib/telemetry/context";

export function createServerApiClient(token?: string) {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  return createApiClient({
    baseUrl: process.env.BACKEND_API_URL || (publicUrl && /^https?:\/\//.test(publicUrl) ? publicUrl : "http://localhost/api"),
    token,
    async getHeaders() {
      const outgoing: Record<string, string> = {};
      propagation.inject(context.active(), outgoing);
      let incomingId: string | undefined;
      try {
        const incoming = await headers();
        incomingId = validRequestId(incoming.get("x-request-id"));
        // Calls made for a browser (sign-in) keep the browser's address for the audit log. The proxy
        // appended it last, and the backend only trusts that last entry.
        const forwarded = incoming.get("x-forwarded-for");
        if (forwarded) outgoing["x-forwarded-for"] = forwarded;
      } catch {
        // Background server calls have no Next.js request context.
      }
      outgoing["x-request-id"] = incomingId ?? currentRequestId() ?? randomUUID();
      return outgoing;
    },
  });
}
