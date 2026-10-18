import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import type { CurrencyCode } from "@/features/events/types";
import { getEventBySlugOrId, getSeatDetails, type SeatDetail } from "@/features/events/queries";
import { findHoldEventId, holdTtlRemaining, readHold } from "@/features/holds/redis";
import type { HoldManifest } from "@/features/holds/types";

/**
 * Order lookups. `holdId` is the key the checkout page arrives with; `reference`
 * is the key Paystack's webhook arrives with. Both are unique-indexed in the
 * schema, so each is a single indexed point read.
 */
export async function getOrderByHoldId(holdId: string) {
  const [row] = await getDb().select().from(orders).where(eq(orders.holdId, holdId)).limit(1);
  return row ?? null;
}

/** The webhook's correlation key: Paystack only ever knows the reference. */
export async function getOrderByReference(reference: string) {
  const [row] = await getDb().select().from(orders).where(eq(orders.reference, reference)).limit(1);
  return row ?? null;
}

/** Snapshotted line items, priciest first so the receipt reads like a bill. */
export async function getOrderItems(orderId: string) {
  return getDb()
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(desc(orderItems.unitPriceCents));
}

/**
 * Everything `/checkout/[holdId]` needs, in one call, with Redis as the judge
 * of whether the hold is still alive.
 *
 * The four states are deliberately exhaustive so the page never has to guess:
 *  - `active`    - the buyer still has time and can pay
 *  - `paid`      - the webhook already settled this order (double-tab safety)
 *  - `expired`   - the TTL lapsed, or the buyer released it
 *  - `not_found` - unknown hold id
 */
export type CheckoutView =
  | {
      state: "active";
      hold: HoldManifest;
      items: SeatDetail[];
      event: NonNullable<Awaited<ReturnType<typeof getEventBySlugOrId>>>;
      secondsRemaining: number;
    }
  | {
      state: "paid";
      reference: string;
      email: string | null;
      items: Awaited<ReturnType<typeof getOrderItems>>;
      totalCents: number;
      currency: CurrencyCode;
    }
  | { state: "expired" }
  | { state: "not_found" };

export async function getCheckoutView(holdId: string): Promise<CheckoutView> {
  const eventId = await findHoldEventId(holdId);

  if (!eventId) {
    // Either the hold expired, or it was paid and released. Ask Postgres.
    const order = await getOrderByHoldId(holdId);
    if (!order) return { state: "not_found" };
    if (order.status === "paid") {
      const items = await getOrderItems(order.id);
      return {
        state: "paid",
        reference: order.reference,
        email: order.buyerEmail,
        items,
        totalCents: order.totalCents,
        currency: order.currency,
      };
    }
    return { state: "expired" };
  }

  const [hold, secondsRemaining, event] = await Promise.all([
    readHold(eventId, holdId),
    holdTtlRemaining(eventId, holdId),
    getEventBySlugOrId(eventId),
  ]);

  if (!hold || secondsRemaining === null || !event) return { state: "expired" };

  const items = await getSeatDetails(eventId, hold.seatIds);

  return { state: "active", hold, items, event, secondsRemaining };
}
