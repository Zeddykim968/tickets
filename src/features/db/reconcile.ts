/**
 * Reconcile Postgres against Redis.
 *
 * Redis owns the 10-minute window, and its TTL is the only thing that releases
 * a seat. That is the right design — no sweeper is needed for correctness — but
 * it means two pieces of *derived* state drift:
 *
 *   1. `seats.hold_id` / `seats.hold_expires_at` are a mirror written when a
 *      hold is granted. Nothing clears them when the TTL lapses.
 *   2. `orders` stay `pending` forever if the buyer simply walked away; only an
 *      explicit "release seats" click marks them `abandoned`.
 *
 * Neither can steal a seat from anyone (Redis is authoritative for that), but
 * both make support tooling lie. This job closes the loop.
 *
 * Run with `npm run db:reconcile`. Safe to run on a schedule; every write is
 * guarded so a concurrent reconciliation is idempotent.
 */
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getLiveHoldIds } from "../features/holds/redis";
import { loadEnvFiles } from "../lib/load-env";
import { closeDb, getDb } from "./index";
import { orders, seats } from "./schema";

const BATCH_SIZE = 500;

async function main() {
  loadEnvFiles();

  const db = getDb();

  // -------------------------------------------------------------------------
  // 1. Seats whose mirrored hold has lapsed and whose Redis key is gone.
  // -------------------------------------------------------------------------
  const staleSeats = await db
    .select({ id: seats.id, eventId: seats.eventId, holdId: seats.holdId })
    .from(seats)
    .where(
      and(
        isNotNull(seats.holdId),
        // `expires_at IS NULL` would fall out of a bare `< now()` comparison
        // (NULL is never true), leaving that row unwakeable.
        or(sql`${seats.holdExpiresAt} < now()`, isNull(seats.holdExpiresAt)),
      ),
    )
    .limit(BATCH_SIZE);

  // One pipelined Redis read for the whole batch, not one per row.
  const liveSeatHolds = await getLiveHoldIds(
    staleSeats.flatMap((seat) =>
      seat.holdId ? [{ eventId: seat.eventId, holdId: seat.holdId }] : [],
    ),
  );

  let clearedSeats = 0;

  for (const seat of staleSeats) {
    if (!seat.holdId) continue;

    // A live Redis key means our clocks disagree - believe Redis and leave it.
    if (liveSeatHolds.has(seat.holdId)) continue;

    await db
      .update(seats)
      .set({ holdId: null, holdExpiresAt: null, updatedAt: new Date() })
      .where(eq(seats.id, seat.id));

    clearedSeats += 1;
  }

  // -------------------------------------------------------------------------
  // 2. Pending orders past their deadline with no live hold -> abandoned.
  // -------------------------------------------------------------------------
  const staleOrders = await db
    .select({ id: orders.id, eventId: orders.eventId, holdId: orders.holdId })
    .from(orders)
    .where(and(eq(orders.status, "pending"), sql`${orders.expiresAt} < now()`))
    .limit(BATCH_SIZE);

  const liveOrderHolds = await getLiveHoldIds(
    staleOrders.map((order) => ({ eventId: order.eventId, holdId: order.holdId })),
  );

  let abandoned = 0;

  for (const order of staleOrders) {
    if (liveOrderHolds.has(order.holdId)) continue;

    // Guarded by status so a payment landing mid-sweep always wins.
    await db
      .update(orders)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));

    abandoned += 1;
  }

  console.log(
    `\nReconciled: cleared ${clearedSeats} stale seat hold(s), abandoned ${abandoned} lapsed order(s).\n` +
      (staleSeats.length === BATCH_SIZE || staleOrders.length === BATCH_SIZE
        ? "Batch limit reached — run again to continue.\n"
        : ""),
  );

  await closeDb();
}

main().catch(async (error) => {
  console.error("\nReconcile failed:", error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exitCode = 1;
});
