"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { orderItems, orders, seats } from "@/db/schema";
import { getReservableSeats } from "@/features/events/queries";
import { calculateOrderTotals } from "@/features/orders/pricing";
import { holdTtlSeconds } from "@/lib/env";
import { newReference } from "@/lib/utils";
import {
  acquireHold,
  findHoldEventId,
  getLockedSeatIds,
  readHold,
  releaseHold,
} from "./redis";
import type { HoldManifest, ReleaseHoldResult, ReserveSeatsResult } from "./types";
import { releaseHoldSchema, reserveSeatsSchema, type ReserveSeatsInput } from "./validation";

/**
 * Reserve a set of seats for exactly `HOLD_TTL_SECONDS` (10 minutes by default).
 *
 * ## Why this is safe against double-booking
 *
 * Three layers, cheapest first:
 *
 *  1. **Postgres read** - the seats must still be listed and unsold. This
 *     produces the friendly "these were just bought" message.
 *  2. **Redis read** - the seats must not sit inside another buyer's window.
 *     Also only for the error message.
 *  3. **Redis Lua (`acquireHold`)** - the actual gate. Check-and-set runs
 *     inside Redis' single-threaded interpreter, so two simultaneous requests
 *     for the same seat cannot both observe "free" and both claim it. Exactly
 *     one of them gets HTTP-equivalent 200; the other is told which seat it
 *     lost.
 *
 * The hold then expires by itself: every seat lock is a Redis key carrying the
 * hold deadline as its TTL, so an abandoned cart costs us nothing and needs no
 * cron sweep.
 *
 * Prices are read from the database and returned to the client only as
 * display values - the client never sends a price.
 */
export async function reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult> {
  const parsed = reserveSeatsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation",
      message: parsed.error.issues[0]?.message ?? "That request was not valid.",
    };
  }

  const { eventId, buyerEmail, buyerName } = parsed.data;
  const seatIds = [...new Set(parsed.data.seatIds)];

  /**
   * Hoisted so the catch below can hand the seats back if a later step throws
   * *after* Redis already claimed them - the compensating release must not
   * depend on a local binding that only exists on the happy path.
   */
  let claimedHoldId: string | undefined;

  try {
    // --- Layer 1: durable inventory -------------------------------------
    const reservable = await getReservableSeats(eventId, seatIds);

    if (reservable.length !== seatIds.length) {
      const reservableIds = new Set(reservable.map((seat) => seat.id));
      return {
        ok: false,
        reason: "unavailable",
        message: "Some of those seats are no longer available.",
        conflictingSeatIds: seatIds.filter((id) => !reservableIds.has(id)),
      };
    }

    // --- Layer 2: live Redis locks (fast fail with a readable message) ---
    const alreadyLocked = await getLockedSeatIds(eventId, seatIds);
    if (alreadyLocked.size > 0) {
      return {
        ok: false,
        reason: "already_held",
        message:
          alreadyLocked.size === 1
            ? "That seat is in another buyer's cart right now."
            : `${alreadyLocked.size} of those seats are in other buyers' carts right now.`,
        conflictingSeatIds: [...alreadyLocked],
      };
    }

    // --- Build the hold ---------------------------------------------------
    const totals = calculateOrderTotals(reservable.map((seat) => seat.priceCents));
    const ttlSeconds = holdTtlSeconds();
    const now = Date.now();
    const holdId = randomUUID();
    claimedHoldId = holdId;
    const reference = newReference("FR");

    // Every seat in a fixture shares its currency, so one enum read is enough.
    const currency = reservable[0]?.currency ?? "NGN";

    const manifest: HoldManifest = {
      holdId,
      eventId,
      seatIds,
      currency,
      subtotalCents: totals.subtotalCents,
      serviceFeeCents: totals.serviceFeeCents,
      totalCents: totals.totalCents,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    };

    // --- Layer 3: the atomic claim ---------------------------------------
    const acquired = await acquireHold({ eventId, holdId, seatIds, manifest });

    if (!acquired.ok) {
      if (acquired.reason === "invalid") {
        return { ok: false, reason: "validation", message: acquired.message };
      }
      return {
        ok: false,
        reason: "already_held",
        message: "Those seats were taken while you were deciding.",
        conflictingSeatIds: acquired.conflictingSeatIds,
      };
    }

    const expiresAt = new Date(manifest.expiresAt);

    // --- Durable record ---------------------------------------------------
    // Any failure from here on is compensated by the catch block below, which
    // releases the Redis claim. See `claimedHoldId`.
    await getDb().transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            reference,
            holdId,
            eventId,
            buyerEmail,
            buyerName: buyerName ?? null,
            currency,
            subtotalCents: totals.subtotalCents,
            serviceFeeCents: totals.serviceFeeCents,
            totalCents: totals.totalCents,
            status: "pending",
            expiresAt,
            metadata: {
              feeBps: totals.serviceFeeBps,
              holdTtlSeconds: ttlSeconds,
              seatCount: reservable.length,
            },
          })
          .returning({ id: orders.id });

        if (!order) throw new Error("Order insert returned no row");

        await tx.insert(orderItems).values(
          reservable.map((seat) => ({
            orderId: order.id,
            seatId: seat.id,
            sectionLabel: seat.sectionName,
            rowLabel: seat.rowLabel,
            seatNumber: seat.seatNumber,
            category: seat.category,
            viewQuality: seat.viewQuality,
            unitPriceCents: seat.priceCents,
            originalPriceCents: seat.originalPriceCents,
          })),
        );

        // Mirror the hold onto the seats for support/reconciliation. Note we do
        // NOT flip `status` to "held": Redis owns that truth via the TTL, and a
        // status column that can only be cleared by a sweeper is how inventories
        // leak. A reconciliation job promotes seats to "sold" once an order is
        // paid.
        await tx
          .update(seats)
          .set({ holdId, holdExpiresAt: expiresAt, updatedAt: new Date() })
          .where(and(eq(seats.eventId, eventId), inArray(seats.id, seatIds)));
    });

    // The seat map the buyer came from is now stale by exactly these seats.
    revalidatePath(`/marketplace/events/${eventId}`);
    revalidatePath(`/checkout/${holdId}`);

    return {
      ok: true,
      holdId,
      reference,
      expiresAt: manifest.expiresAt,
      ttlSeconds,
      redirectTo: `/checkout/${holdId}`,
    };
  } catch (error) {
    console.error("[holds] reserveSeats failed:", error);

    // Best effort: if Redis claimed the seats and something *after* it threw
    // (for example the hold index write), give them straight back instead of
    // parking them for the full TTL. Compare-and-delete, so this is a no-op
    // when nothing was claimed and when the transaction already compensated.
    if (claimedHoldId) {
      await releaseHold(eventId, claimedHoldId, seatIds).catch((releaseError: unknown) => {
        console.error("[holds] compensating release failed:", releaseError);
      });
    }

    return {
      ok: false,
      reason: "error",
      message: "We couldn't hold those seats just now. Please try again.",
    };
  }
}

/**
 * Hand seats back early - the buyer pressed "back", or payment completed and
 * Postgres now owns the seats.
 *
 * `releaseHold` is a compare-and-delete, so a hold that already expired can
 * never delete the lock of the buyer who bought the seat after it.
 */
export async function releaseHoldAction(holdId: string): Promise<ReleaseHoldResult> {
  const parsed = releaseHoldSchema.safeParse({ holdId });
  if (!parsed.success) return { ok: false, released: 0 };

  try {
    const eventId = await findHoldEventId(parsed.data.holdId);
    // Nothing to do: the TTL already collected it.
    if (!eventId) return { ok: true, released: 0 };

    const manifest = await readHold(eventId, parsed.data.holdId);

    await releaseHold(eventId, parsed.data.holdId, manifest?.seatIds ?? []);

    await getDb()
      .update(orders)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(and(eq(orders.holdId, parsed.data.holdId), eq(orders.status, "pending")));

    revalidatePath(`/marketplace/events/${eventId}`);

    return { ok: true, released: manifest?.seatIds.length ?? 0 };
  } catch (error) {
    console.error("[holds] releaseHold failed:", error);
    // The TTL will clean up regardless, so this is never fatal to the buyer.
    return { ok: false, released: 0 };
  }
}
