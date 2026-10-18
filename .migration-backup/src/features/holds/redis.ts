import { createHash } from "node:crypto";
import Redis from "ioredis";
import { holdTtlSeconds, redisUrl } from "@/lib/env";
import { MAX_SEATS_PER_HOLD } from "./constants";
import { holdIndexKey, holdManifestKey, seatIdFromLockKey, seatLockKey } from "./keys";
import type { AcquireHoldResult, HoldManifest } from "./types";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const globalForRedis = globalThis as unknown as { __frontrowRedis?: Redis };

export function getRedis(): Redis {
  if (globalForRedis.__frontrowRedis) return globalForRedis.__frontrowRedis;

  const client = new Redis(redisUrl(), {
    // Give up per request rather than queueing forever: a hold must fail fast
    // so the UI can honestly say "those seats just went".
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
  });

  client.on("error", (error: Error) => {
    console.error("[redis] connection error:", error.message);
  });

  globalForRedis.__frontrowRedis = client;
  return client;
}

// ---------------------------------------------------------------------------
// Lua
// ---------------------------------------------------------------------------

/**
 * Atomically claim a set of seats for one hold.
 *
 * Two passes: the first validates *every* seat before mutating anything, so a
 * partial hold can never exist. Seat locks and the manifest share one TTL, so
 * they expire together and Redis itself is the garbage collector - releasing
 * an abandoned cart needs no sweeper job.
 *
 * Returns `{ 0, i }` on conflict, where `i` is the **1-based Lua KEYS index**
 * of the offending lock (the JS caller must convert back to a 0-based index).
 */
const ACQUIRE_HOLD_LUA = `
local ttlMs    = tonumber(ARGV[1])
local holdId   = ARGV[2]
local manifest = ARGV[3]

for i = 2, #KEYS do
  local owner = redis.call('GET', KEYS[i])
  -- Free, or already claimed by this same hold id (a safe retry within one request).
  if owner and owner ~= holdId then
    return { 0, i }
  end
end

for i = 2, #KEYS do
  redis.call('PSETEX', KEYS[i], ttlMs, holdId)
end

redis.call('PSETEX', KEYS[1], ttlMs, manifest)

return { 1 }
`;

/**
 * Compare-and-delete release. A hold whose TTL already lapsed must never
 * delete the lock of the buyer who legitimately took the seat afterwards, so
 * each key is only removed when it still points at *this* holdId.
 */
const RELEASE_HOLD_LUA = `
local holdId = ARGV[1]
local removed = 0

for i = 1, #KEYS do
  if redis.call('GET', KEYS[i]) == holdId then
    redis.call('DEL', KEYS[i])
    removed = removed + 1
  end
end

return removed
`;

type ScriptArg = string | number;

/**
 * Run a script via EVALSHA and fall back to EVAL once if the server has been
 * restarted or flushed and no longer knows the digest.
 */
async function runScript(script: string, keys: string[], args: ScriptArg[]) {
  const redis = getRedis();
  const sha = createHash("sha1").update(script).digest("hex");

  try {
    return await redis.evalsha(sha, keys.length, ...keys, ...args);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NOSCRIPT")) {
      return await redis.eval(script, keys.length, ...keys, ...args);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AcquireHoldInput = {
  eventId: string;
  holdId: string;
  seatIds: string[];
  manifest: HoldManifest;
};

/**
 * Take an atomic 10-minute hold on `seatIds`.
 *
 * Ordering note: the caller runs `getLockedSeatIds` first purely to produce a
 * friendly list of conflicts. *This* function is the correctness gate - two
 * buyers racing for the same seat both reach the Lua script, and exactly one
 * of them wins because the check-then-set happens inside Redis' single
 * threaded interpreter.
 */
export async function acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
  const { eventId, holdId, seatIds, manifest } = input;

  if (seatIds.length === 0) {
    return { ok: false, reason: "invalid", message: "Select at least one seat." };
  }
  if (seatIds.length > MAX_SEATS_PER_HOLD) {
    return {
      ok: false,
      reason: "invalid",
      message: `You can hold at most ${MAX_SEATS_PER_HOLD} seats at a time.`,
    };
  }
  if (new Set(seatIds).size !== seatIds.length) {
    return { ok: false, reason: "invalid", message: "Duplicate seats in request." };
  }

  const ttlSeconds = holdTtlSeconds();
  const keys = [holdManifestKey(eventId, holdId), ...seatIds.map((id) => seatLockKey(eventId, id))];

  // The reply is `{ 1 }` on success and `{ 0, conflictingKeyIndex }` on
  // conflict, hence the optional second element.
  const raw = (await runScript(ACQUIRE_HOLD_LUA, keys, [
    ttlSeconds * 1000,
    holdId,
    JSON.stringify(manifest),
  ])) as [number, number?];

  if (raw[0] !== 1) {
    // Lua reported a 1-based KEYS index; JS arrays are 0-based, so subtract one.
    // Getting this wrong would blame the neighbouring seat.
    const conflictIndex = Number(raw[1]) - 1;
    const conflictKey = keys[conflictIndex] ?? keys[1];
    return {
      ok: false,
      reason: "conflict",
      conflictingSeatIds: [seatIdFromLockKey(conflictKey)],
    };
  }

  // The index key lives in a different hash slot (it is only ever touched by
  // single-key commands, which are always cluster-safe), so it is written
  // outside the script. A stale entry is harmless: it TTLs out and resolves to
  // a manifest that no longer exists.
  await getRedis().set(holdIndexKey(holdId), eventId, "EX", ttlSeconds);

  return { ok: true, manifest, ttlSeconds };
}

/**
 * Release a hold early (buyer abandons checkout, or payment completed and the
 * seats are now authored as `sold` in Postgres).
 *
 * Safe to call speculatively: it only deletes keys still owned by `holdId`, so
 * calling it after a partial failure is a no-op rather than a footgun.
 */
export async function releaseHold(eventId: string, holdId: string, seatIds: string[]): Promise<void> {
  const keys = [holdManifestKey(eventId, holdId), ...seatIds.map((id) => seatLockKey(eventId, id))];

  await runScript(RELEASE_HOLD_LUA, keys, [holdId]);
  await getRedis().del(holdIndexKey(holdId));
}

/** Read the manifest, or null when the hold has already expired. */
export async function readHold(eventId: string, holdId: string): Promise<HoldManifest | null> {
  const json = await getRedis().get(holdManifestKey(eventId, holdId));
  if (!json) return null;

  try {
    return JSON.parse(json) as HoldManifest;
  } catch {
    // Corrupt payload: drop it rather than 500 the checkout page.
    await getRedis().del(holdManifestKey(eventId, holdId));
    return null;
  }
}

/** Resolve which event a hold belongs to, for `/checkout/[holdId]`. */
export async function findHoldEventId(holdId: string): Promise<string | null> {
  return getRedis().get(holdIndexKey(holdId));
}

/**
 * Remaining lifetime of a whole hold, in seconds.
 *
 * The checkout countdown reads this rather than subtracting dates client-side:
 * the TTL *is* the authority, and a buyer cannot extend their own window by
 * changing their system clock.
 */
export async function holdTtlRemaining(eventId: string, holdId: string): Promise<number | null> {
  const ttl = await getRedis().ttl(holdManifestKey(eventId, holdId));
  return ttl > 0 ? ttl : null;
}

/**
 * Which of these holds are still live?
 *
 * One pipelined MGET rather than one GET per hold: the reconciliation sweep
 * checks up to 500 holds per pass, and a sequential loop would mean thousands
 * of round trips. Hold ids are globally unique, so a set of them is enough.
 */
export async function getLiveHoldIds(
  holds: Array<{ eventId: string; holdId: string }>,
): Promise<Set<string>> {
  const live = new Set<string>();
  if (holds.length === 0) return live;

  const values = await getRedis().mget(
    ...holds.map((hold) => holdManifestKey(hold.eventId, hold.holdId)),
  );

  holds.forEach((hold, index) => {
    if (values[index]) live.add(hold.holdId);
  });

  return live;
}

/**
 * Which of these seats are currently held by *someone*?
 *
 * Chunked MGET: one round trip per 500 seats instead of one per seat. This is
 * the read path behind both the availability badges and the listing feed, so
 * it runs on every poll.
 */
export async function getLockedSeatIds(eventId: string, seatIds: string[]): Promise<Set<string>> {
  const locked = new Set<string>();
  if (seatIds.length === 0) return locked;

  const redis = getRedis();
  const CHUNK_SIZE = 500;

  for (let offset = 0; offset < seatIds.length; offset += CHUNK_SIZE) {
    const chunk = seatIds.slice(offset, offset + CHUNK_SIZE);
    const values = await redis.mget(...chunk.map((seatId) => seatLockKey(eventId, seatId)));

    for (let i = 0; i < chunk.length; i += 1) {
      if (values[i]) locked.add(chunk[i]);
    }
  }

  return locked;
}
