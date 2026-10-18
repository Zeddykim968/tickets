import assert from "node:assert/strict";
import test from "node:test";
import Redis from "ioredis";
import { redisUrl } from "@/lib/env";
import { holdIndexKey, holdManifestKey, seatLockKey } from "./keys";
import { acquireHold, getLockedSeatIds, getRedis, readHold, releaseHold } from "./redis";
import type { AcquireHoldResult, HoldManifest } from "./types";

type Won = Extract<AcquireHoldResult, { ok: true }>;
type Lost = Extract<AcquireHoldResult, { ok: false }>;
type Conflict = Extract<AcquireHoldResult, { reason: "conflict" }>;

const won = (result: AcquireHoldResult): result is Won => result.ok;
const lost = (result: AcquireHoldResult): result is Lost => !result.ok;

/**
 * `assert.ok(won(result))` does not narrow `result` in TypeScript - assertion
 * signatures only narrow their own argument - so these throw-and-return helpers
 * carry the narrowing instead. They still fail the test when the expectation
 * does not hold.
 */
function mustWin(result: AcquireHoldResult, message = "expected the hold to be granted"): Won {
  if (!result.ok) throw new Error(`${message} (got ${result.reason})`);
  return result;
}

function mustLose(result: AcquireHoldResult, message = "expected the hold to be refused"): Lost {
  if (result.ok) throw new Error(message);
  return result;
}

function mustConflict(
  result: AcquireHoldResult,
  message = "expected the claim to lose to an existing hold",
): Conflict {
  if (result.ok || result.reason !== "conflict") {
    throw new Error(`${message} (got ${result.ok ? "a grant" : result.reason})`);
  }
  return result;
}

/**
 * Integration tests for the seat-hold engine.
 *
 * These cover the questions a typecheck cannot answer: whether a race really is
 * closed, whether a rejected claim can leave a half-taken hold behind, and
 * whether a lapsed hold can evict the lock of the buyer who took the seat
 * afterwards.
 *
 * They require a real Redis, because the guarantee under test *is* Redis'
 * single-threaded execution of the Lua script - a mock would only ever assert
 * our own copy of the algorithm. Start one with:
 *
 *   docker run --rm -p 6379:6379 redis:7-alpine
 *   npm test
 *
 * Without a reachable Redis the suite reports itself as skipped rather than
 * failing, so `npm test` stays useful in a bare checkout.
 */

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";

/** Every hold this run created, so teardown can reclaim all of its keys. */
const createdHolds: Array<{ eventId: string; holdId: string; seatIds: string[] }> = [];

/**
 * Is Redis actually there? Probes with a throwaway client that is configured to
 * fail immediately, so the shared client is never left in a retry loop on a
 * machine with no server running.
 */
async function probeRedis(): Promise<boolean> {
  const client = new Redis(redisUrl(), {
    lazyConnect: true,
    connectTimeout: 800,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  client.on("error", () => {
    // Swallowed on purpose: an unreachable server is a skip, not a failure.
  });

  try {
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    client.disconnect();
    return false;
  }
}

let holdCounter = 0;
function nextHoldId() {
  holdCounter += 1;
  return `test-hold-${process.pid}-${Date.now()}-${holdCounter}`;
}

function manifestFor(eventId: string, holdId: string, seatIds: string[]): HoldManifest {
  const now = Date.now();
  return {
    holdId,
    eventId,
    seatIds,
    currency: "NGN",
    subtotalCents: seatIds.length * 45_000,
    serviceFeeCents: seatIds.length * 3_375,
    totalCents: seatIds.length * 48_375,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
  };
}

/** Claim seats and remember the hold, so teardown is independent of the body. */
function claim(eventId: string, holdId: string, seatIds: string[]) {
  createdHolds.push({ eventId, holdId, seatIds });
  return acquireHold({ eventId, holdId, seatIds, manifest: manifestFor(eventId, holdId, seatIds) });
}

function key(seatId: string) {
  return seatLockKey(EVENT_ID, seatId);
}

test("hold engine (requires Redis)", async (t) => {
  const ready = await probeRedis();

  if (!ready) {
    t.skip(`no Redis at ${redisUrl()} - run "docker run --rm -p 6379:6379 redis:7-alpine" to execute these`);
    return;
  }

  // Teardown is a hook, not a final subtest: `await t.test(...)` rejects when a
  // subtest fails, which would abort the parent body and skip a trailing
  // cleanup step - leaving seat locks held for the full 600s and making the
  // *next* run fail for an unrelated reason. This also closes the engine's
  // `globalThis`-cached client, which would otherwise keep the loop alive.
  t.after(async () => {
    try {
      const redis = getRedis();
      const keys = createdHolds.flatMap(({ eventId, holdId, seatIds }) => [
        holdManifestKey(eventId, holdId),
        holdIndexKey(holdId),
        ...seatIds.map((seatId) => seatLockKey(eventId, seatId)),
      ]);

      if (keys.length > 0) await redis.del(...keys);
      await redis.quit();
    } catch {
      // Teardown is best effort; the TTL is the real backstop.
    }
  });

  await t.test("exactly one of many simultaneous buyers wins the same seat", async () => {
    const seatId = "seat:race";
    const buyers = 32;

    const results = await Promise.all(
      Array.from({ length: buyers }, () => claim(EVENT_ID, nextHoldId(), [seatId])),
    );

    const winners = results.filter(won);

    // This is the whole point of doing check-and-set inside Lua: if the gate
    // were a separate GET followed by a SET, far more than one of these would
    // win. It is a probabilistic detector (a lucky interleaving could slip
    // past), which is why the buyer count is deliberately generous - but the
    // failures it is looking for are structural, so they show up every time.
    assert.equal(winners.length, 1, `exactly one of ${buyers} concurrent claims may succeed`);
    assert.equal(results.filter(lost).length, buyers - 1);

    for (const loser of results.filter(lost)) {
      assert.equal(loser.reason, "conflict");
    }

    // One winner, one owner: the seat is locked by that hold and nothing else.
    const client = new Redis(redisUrl());
    assert.equal(await client.get(key(seatId)), winners[0].manifest.holdId);
    await client.quit();
  });

  await t.test("a live hold round-trips through Redis intact", async () => {
    const seatId = "seat:manifest";
    const holdId = nextHoldId();

    const acquired = mustWin(await claim(EVENT_ID, holdId, [seatId]));

    // A corrupt or shape-shifted manifest must not 500 the checkout page, and
    // the happy path is what proves the writer and reader agree.
    const manifest = await readHold(EVENT_ID, holdId);
    assert.ok(manifest, "a live hold must read back");
    assert.equal(manifest.holdId, holdId);
    assert.deepEqual(manifest.seatIds, [seatId]);
    assert.equal(manifest.eventId, EVENT_ID);
    assert.equal(manifest.totalCents, acquired.manifest.totalCents);
    assert.equal(acquired.ttlSeconds, 600, "the default window is ten minutes");

    // The seat is reported as held by the read path the UI actually polls.
    assert.deepEqual([...(await getLockedSeatIds(EVENT_ID, [seatId]))], [seatId]);
  });

  await t.test("a losing racer is told the correct seat, and never a partial hold", async () => {
    // Seat B is already inside somebody else's cart.
    const seatA = "seat:blame-a";
    const seatB = "seat:blame-b";

    const incumbentHoldId = nextHoldId();
    mustWin(await claim(EVENT_ID, incumbentHoldId, [seatB]));

    const challenger = mustConflict(await claim(EVENT_ID, nextHoldId(), [seatB, seatA]));

    // The Lua script reports a 1-based KEYS index and the JS caller must
    // convert it; getting that wrong blames the neighbouring seat instead.
    assert.deepEqual(challenger.conflictingSeatIds, [seatB]);

    // All-or-nothing: the valid half of a rejected request must NOT be left
    // silently claimed, or the buyer loses a seat they were told they never got.
    assert.equal(
      (await getLockedSeatIds(EVENT_ID, [seatA])).size,
      0,
      "a failed claim must not half-hold its seats",
    );
  });

  await t.test("the Redis TTL is the deadline, and expiry frees the seat", async () => {
    const seatId = "seat:ttl";
    const holdId = nextHoldId();

    // `holdTtlSeconds()` reads the environment on every call (it is not
    // memoised); if that ever changes, this subtest needs a different seam.
    const previousTtl = process.env.HOLD_TTL_SECONDS;
    process.env.HOLD_TTL_SECONDS = "1";
    const client = new Redis(redisUrl());

    try {
      mustWin(await claim(EVENT_ID, holdId, [seatId]));

      const ttlMs = await client.pttl(key(seatId));
      assert.ok(ttlMs > 0 && ttlMs <= 1000, `seat lock TTL should be <= 1s, got ${ttlMs}ms`);

      // No sweeper clears this - the key simply stops existing.
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      assert.equal(await client.get(key(seatId)), null, "the lock must lapse on its own");
      assert.equal(await readHold(EVENT_ID, holdId), null, "the manifest must lapse with it");

      // ...and the seat is immediately buyable by somebody else.
      mustWin(
        await claim(EVENT_ID, nextHoldId(), [seatId]),
        "an expired hold must not block a new buyer",
      );
    } finally {
      // Closed in `finally` so a failed assertion cannot strand the socket.
      await client.quit().catch(() => undefined);

      if (previousTtl === undefined) delete process.env.HOLD_TTL_SECONDS;
      else process.env.HOLD_TTL_SECONDS = previousTtl;
    }
  });

  await t.test("release is compare-and-delete, so a lapsed hold cannot evict its successor", async () => {
    const seatId = "seat:cad";
    const originalHoldId = nextHoldId();
    const successorHoldId = nextHoldId();

    // The original buyer's hold lapses, then a second buyer takes the seat.
    await releaseHold(EVENT_ID, originalHoldId, [seatId]);
    mustWin(await claim(EVENT_ID, successorHoldId, [seatId]));

    // Now the first buyer's stale "back button" fires. It must be a no-op.
    await releaseHold(EVENT_ID, originalHoldId, [seatId]);

    const client = new Redis(redisUrl());
    assert.equal(
      await client.get(key(seatId)),
      successorHoldId,
      "a stale release must not free a seat that now belongs to someone else",
    );

    // ...and the rightful owner can still hand it back.
    await releaseHold(EVENT_ID, successorHoldId, [seatId]);
    assert.equal(await client.get(key(seatId)), null);
    await client.quit();
  });

  await t.test("holds are scoped per event and reject invalid requests", async () => {
    const seatId = "seat:scope";
    mustWin(await claim(EVENT_ID, nextHoldId(), [seatId]));

    // The same seat id at a different fixture is a different seat.
    const scoped = mustWin(
      await claim(OTHER_EVENT_ID, nextHoldId(), [seatId]),
      "the same seat id at another event is not a conflict",
    );
    assert.equal(scoped.manifest.eventId, OTHER_EVENT_ID);

    const tooMany = mustLose(
      await claim(EVENT_ID, nextHoldId(), Array.from({ length: 9 }, (_, i) => `seat:bulk-${i}`)),
    );
    assert.equal(tooMany.reason, "invalid");

    const duplicated = mustLose(await claim(EVENT_ID, nextHoldId(), [seatId, seatId]));
    assert.equal(duplicated.reason, "invalid");
  });

  await t.test("key builders keep the cluster-safety invariant", () => {
    // The {ev:...} hash tag pins every hold key for one event to a single Redis
    // Cluster slot, which is what makes the multi-key Lua script legal.
    assert.match(holdManifestKey(EVENT_ID, "h1"), /\{ev:[0-9a-f]{8}\}/);
    assert.match(seatLockKey(EVENT_ID, "s1"), /\{ev:[0-9a-f]{8}\}/);

    // The index key is deliberately outside the tag: it is only ever touched by
    // single-key commands, which are always slot-safe.
    assert.doesNotMatch(holdIndexKey("h1"), /\{/);
  });
});
