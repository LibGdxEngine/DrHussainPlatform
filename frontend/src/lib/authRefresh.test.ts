import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REFRESH_WINDOW_MS,
  SESSION_MAX_MS,
  accessTokenExpiry,
  needsRefresh,
  refreshOnce,
  sessionExpiredAt,
} from "./authRefresh";

afterEach(() => vi.unstubAllGlobals());

describe("needsRefresh", () => {
  it("is true inside the last minute, and after expiry", () => {
    const now = 1_000_000;
    expect(needsRefresh(now + REFRESH_WINDOW_MS + 1, now)).toBe(false);
    expect(needsRefresh(now + REFRESH_WINDOW_MS, now)).toBe(true);
    expect(needsRefresh(now - 1, now)).toBe(true);
  });

  it("does nothing when the expiry is unknown", () => {
    expect(needsRefresh(undefined, 1)).toBe(false);
  });
});

describe("accessTokenExpiry", () => {
  it("reads exp in milliseconds", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_800_000_000 })).toString("base64url");
    expect(accessTokenExpiry(`h.${payload}.s`)).toBe(1_800_000_000_000);
    expect(accessTokenExpiry("not-a-jwt")).toBeUndefined();
  });
});

describe("sessionExpiredAt", () => {
  it("ends the session after 8 hours, not before", () => {
    const loginAt = 5_000;
    expect(sessionExpiredAt(loginAt, loginAt + SESSION_MAX_MS)).toBe(false);
    expect(sessionExpiredAt(loginAt, loginAt + SESSION_MAX_MS + 1)).toBe(true);
  });

  it("treats a missing sign-in time as expired", () => {
    expect(sessionExpiredAt(undefined, 1)).toBe(true);
  });
});

describe("refreshOnce", () => {
  it("makes one backend call for concurrent requests with the same token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response(JSON.stringify({ access: "new-access", refresh: "new-refresh" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([refreshOnce("old", null), refreshOnce("old", null)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ access: "new-access", refresh: "new-refresh" });
    expect(b).toEqual(a);
  });

  it("reuses the pair another request cached under the old token", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const pair = { access: "a", refresh: "r" };
    const cache = { get: vi.fn().mockResolvedValue(pair), set: vi.fn() };
    expect(await refreshOnce("cached-old", cache)).toEqual(pair);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the backend refuses, and lets a later call try again", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(refreshOnce("bad", null)).rejects.toThrow("HTTP 401");
    await expect(refreshOnce("bad", null)).rejects.toThrow("HTTP 401");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
