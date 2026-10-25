// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useSession } from "next-auth/react";
import SessionProvider from "@/components/SessionProvider";
import { registerSessionExpiry } from "../browser";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../browser", () => ({ registerSessionExpiry: vi.fn().mockReturnValue(() => {}) }));
afterEach(cleanup);

it("connects protected failures to token-specific NextAuth updates", async () => {
  const update = vi.fn().mockResolvedValue({ expires: "2099-01-01", sessionExpired: true });
  vi.mocked(useSession).mockReturnValue({ data: null, status: "unauthenticated", update });
  render(<SessionProvider><div>Child</div></SessionProvider>);
  await waitFor(() => expect(registerSessionExpiry).toHaveBeenCalled());
  const expire = vi.mocked(registerSessionExpiry).mock.calls[0][0];
  await expire("expired-token");
  expect(update).toHaveBeenCalledExactlyOnceWith({ invalidateAccessToken: "expired-token" });
});

