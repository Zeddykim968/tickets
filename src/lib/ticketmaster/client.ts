import "server-only";
import { getRedis } from "@/features/holds/redis";
import { ticketmasterApiKey } from "@/lib/ticketmaster/config";

const DISCOVERY_BASE_URL = "https://app.ticketmaster.com/discovery/v2";
const REQUESTS_PER_SECOND = 4;
export const TICKETMASTER_DAILY_HARD_LIMIT = 5_000;
export const TICKETMASTER_DAILY_SYNC_LIMIT = 4_000;
const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], 1000) end
if count <= tonumber(ARGV[1]) then return 0 end
return redis.call('PTTL', KEYS[1])
`;

export type TicketmasterQuotaSnapshot = {
  rateLimit: string | null;
  available: string | null;
  over: string | null;
  reset: string | null;
  observedAt: string;
};

export class TicketmasterApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TicketmasterApiError";
  }
}

async function waitForRateSlot() {
  const redis = getRedis();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const waitMs = Number(await redis.eval(
      RATE_LIMIT_LUA,
      1,
      "ticketmaster:discovery:rate:second",
      REQUESTS_PER_SECOND,
    ));
    if (waitMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.max(20, waitMs)));
  }
  throw new TicketmasterApiError(429, "local_rate_limit", "Ticketmaster request rate is temporarily limited.");
}

async function incrementDailyUsage(backgroundSync: boolean) {
  const redis = getRedis();
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const key = `ticketmaster:discovery:daily:${dayKey}`;
  const used = await redis.incr(key);
  if (used === 1) {
    const nextUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    await redis.expireat(key, Math.floor(nextUtcDay.getTime() / 1000));
  }

  if (used > TICKETMASTER_DAILY_HARD_LIMIT || (backgroundSync && used > TICKETMASTER_DAILY_SYNC_LIMIT)) {
    throw new TicketmasterApiError(
      429,
      "daily_quota_guard",
      backgroundSync
        ? "Ticketmaster background sync paused at the daily quota safety threshold."
        : "Ticketmaster daily request safety limit reached.",
    );
  }
  return used;
}

export async function ticketmasterQuotaSnapshot(): Promise<TicketmasterQuotaSnapshot | null> {
  const value = await getRedis().get("ticketmaster:discovery:quota:last");
  if (!value) return null;
  try {
    return JSON.parse(value) as TicketmasterQuotaSnapshot;
  } catch (error) {
    console.error("[ticketmaster] invalid cached quota snapshot", error);
    return null;
  }
}

export async function ticketmasterDailyUsage() {
  const key = `ticketmaster:discovery:daily:${new Date().toISOString().slice(0, 10)}`;
  return Number((await getRedis().get(key)) ?? "0");
}

export async function requestDiscovery(
  resource: string,
  params: Record<string, string | number | undefined> = {},
  options: { backgroundSync?: boolean } = {},
): Promise<unknown> {
  if (!resource.startsWith("/") || resource.includes("..")) {
    throw new Error("Ticketmaster Discovery resource path is invalid.");
  }

  const apiKey = ticketmasterApiKey();
  await waitForRateSlot();
  await incrementDailyUsage(options.backgroundSync ?? false);

  const url = new URL(`${DISCOVERY_BASE_URL}${resource}`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    const quota: TicketmasterQuotaSnapshot = {
      rateLimit: response.headers.get("rate-limit"),
      available: response.headers.get("rate-limit-available"),
      over: response.headers.get("rate-limit-over"),
      reset: response.headers.get("rate-limit-reset"),
      observedAt: new Date().toISOString(),
    };
    await getRedis().set("ticketmaster:discovery:quota:last", JSON.stringify(quota), "EX", 172_800);

    if (!response.ok) {
      throw new TicketmasterApiError(
        response.status,
        response.status === 429 || Number(quota.over ?? "0") > 0 ? "upstream_rate_limit" : "upstream_error",
        `Ticketmaster Discovery request failed (${response.status}).`,
      );
    }
    if (Number(quota.over ?? "0") > 0) {
      throw new TicketmasterApiError(429, "upstream_rate_limit", "Ticketmaster reports that the API quota is exceeded.");
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TicketmasterApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TicketmasterApiError(504, "upstream_timeout", "Ticketmaster Discovery request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
