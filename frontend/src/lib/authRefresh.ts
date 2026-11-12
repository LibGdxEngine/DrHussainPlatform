import { createHash } from "node:crypto";
import { createApiClient } from "@/lib/api/client";

/** The access token is renewed once it is this close to expiring. */
export const REFRESH_WINDOW_MS = 60_000;
/** A sign-in lasts at most this long, however often the token is renewed. */
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
/** How long a renewed pair is kept for requests that still carry the old refresh token. */
const RESULT_TTL_SECONDS = 60;

export interface TokenPair {
  access: string;
  refresh: string;
}

/** Where a renewed pair is shared between server processes; best effort. */
export interface PairCache {
  get(key: string): Promise<TokenPair | null>;
  set(key: string, pair: TokenPair): Promise<void>;
}

/** The `exp` claim of a JWT access token in milliseconds, or undefined when it cannot be read. */
export function accessTokenExpiry(accessToken: string | undefined): number | undefined {
  const payload = accessToken?.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** True when the access token expires within the refresh window (or already has). */
export function needsRefresh(expiry: number | undefined, now: number): boolean {
  return expiry !== undefined && expiry - now <= REFRESH_WINDOW_MS;
}

/** True once more than 8 hours have passed since sign-in. A token with no sign-in time is treated as expired. */
export function sessionExpiredAt(loginAt: number | undefined, now: number): boolean {
  return loginAt === undefined || now - loginAt > SESSION_MAX_MS;
}

const inFlight = new Map<string, Promise<TokenPair>>();

const cacheKey = (refreshToken: string) =>
  `auth:refresh:${createHash("sha256").update(refreshToken).digest("hex")}`;

let redisCache: PairCache | null | undefined;

/** A Redis-backed cache when AUTH_SESSION_REDIS_URL is set; otherwise none. Failures never break sign-in. */
function defaultCache(): PairCache | null {
  const url = process.env.AUTH_SESSION_REDIS_URL;
  if (!url) return null;
  if (redisCache) return redisCache;
  let connecting: Promise<import("redis").RedisClientType> | undefined;
  const client = () => {
    connecting ??= import("redis").then(async ({ createClient }) => {
      const created = createClient({ url });
      created.on("error", () => undefined);
      await created.connect();
      return created as unknown as import("redis").RedisClientType;
    });
    return connecting;
  };
  redisCache = {
    async get(key) {
      try {
        const raw = await (await client()).get(key);
        return raw ? (JSON.parse(raw) as TokenPair) : null;
      } catch {
        return null;
      }
    },
    async set(key, pair) {
      try {
        await (await client()).set(key, JSON.stringify(pair), { EX: RESULT_TTL_SECONDS });
      } catch {
        // The cache only smooths over concurrent requests.
      }
    },
  };
  return redisCache;
}

function backendBase(): string {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  return process.env.BACKEND_API_URL || (publicUrl && /^https?:\/\//.test(publicUrl) ? publicUrl : "http://localhost/api");
}

async function requestPair(refreshToken: string): Promise<TokenPair> {
  const data = await createApiClient({ baseUrl: backendBase() })
    .post<Partial<TokenPair>>("/v1/auth/token/refresh/", { refresh: refreshToken }, { auth: false });
  if (typeof data.access !== "string" || typeof data.refresh !== "string") {
    throw new Error("Token refresh returned no tokens.");
  }
  return { access: data.access, refresh: data.refresh };
}

/**
 * Renews the token pair once per refresh token. Refresh tokens rotate and the old one is blacklisted,
 * so concurrent requests carrying the same cookie must share one backend call: in this process through
 * a promise map, and across processes through a short-lived cache keyed by a hash of the old token.
 */
export function refreshOnce(refreshToken: string, cache: PairCache | null = defaultCache()): Promise<TokenPair> {
  const pending = inFlight.get(refreshToken);
  if (pending) return pending;
  const key = cacheKey(refreshToken);
  const run = (async () => {
    const shared = await cache?.get(key);
    if (shared) return shared;
    const pair = await requestPair(refreshToken);
    await cache?.set(key, pair);
    return pair;
  })();
  inFlight.set(refreshToken, run);
  const clear = () => {
    if (inFlight.get(refreshToken) === run) inFlight.delete(refreshToken);
  };
  run.then(clear, clear);
  return run;
}
