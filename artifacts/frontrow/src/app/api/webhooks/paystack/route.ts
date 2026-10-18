import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { orderItems, orders, seats } from "@/db/schema";
import { verifyPaystackSignature, verifyTransaction } from "@/features/checkout/paystack";
import { releaseHold } from "@/features/holds/redis";

// node:crypto and ioredis -> not the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackWebhookEvent = {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
    paid_at?: string;
    status?: string;
    /**
     * Refund events nest the original transaction rather than carrying the
     * reference at the top level, so both shapes are read below.
     */
    transaction?: { reference?: string };
  };
};

/**
 * POST /api/webhooks/paystack
 *
 * ## Security model
 * 1. The **raw** body is hashed (never a re-serialised `JSON.parse` output),
 *    because the HMAC covers the exact bytes Paystack sent.
 * 2. The signature is compared in constant time.
 * 3. The webhook is only a *trigger*. The amount and status are re-fetched
 *    from `/transaction/verify` before anything is fulfilled, so a replayed
 *    body - even a correctly signed one - cannot settle a different amount.
 * 4. Fulfilment is idempotent: the order must still be `pending` for seats to
 *    move, and Postgres enforces one order per holdId, so Paystack's at-least-
 *    once retries converge on the same state.
 *
 * Orders are never *created* here. An unknown reference is logged and ignored:
 * a webhook must not be able to invent inventory.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    console.warn("[paystack] rejected webhook with an invalid signature");
    return NextResponse.json({ status: false, message: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ status: false, message: "Malformed payload" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "charge.success":
        await fulfilPaidOrder(event.data.reference);
        break;

      case "refund.processed":
        await revertRefundedOrder(event.data.reference ?? event.data.transaction?.reference);
        break;

      default:
        // Paystack emits many event types; unknown ones are acknowledged so
        // they are not retried forever.
        console.info("[paystack] acknowledged unhandled event:", event.event);
    }
  } catch (error) {
    console.error("[paystack] handler failed for", event.event, error);
    // 500 -> Paystack retries with backoff. Correct for transient DB/Redis faults.
    return NextResponse.json({ status: false }, { status: 500 });
  }

  return NextResponse.json({ status: true });
}

async function fulfilPaidOrder(reference: string | undefined) {
  if (!reference) return;

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);

  if (!order) {
    console.warn("[paystack] charge.success for unknown reference:", reference);
    return;
  }

  // Idempotency fast path for the second, third, ... delivery of the same event.
  if (order.status === "paid") return;

  // Re-verify: never fulfil on the strength of the webhook body alone.
  const verified = await verifyTransaction(reference);

  if (verified.status !== "success") {
    await db
      .update(orders)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason: `Paystack reports status "${verified.status}"`,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    return;
  }

  if (verified.amount !== order.totalCents) {
    // Under- or over-payment. Do not fulfil; flag for support.
    console.error(
      `[paystack] amount mismatch on ${reference}: expected ${order.totalCents}, got ${verified.amount}`,
    );
    await db
      .update(orders)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason: `Amount mismatch: expected ${order.totalCents} minor units, received ${verified.amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    return;
  }

  const items = await db
    .select({ seatId: orderItems.seatId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const seatIds = items.map((item) => item.seatId);

  await db.transaction(async (tx) => {
    if (seatIds.length > 0) {
      // `status = sold` is the durable truth, and the guard on the UPDATE means
      // a concurrent retry cannot double-apply. `isListed` stays true so the
      // event page can still render the seat as a greyed-out "Sold" row.
      await tx
        .update(seats)
        .set({
          status: "sold",
          holdId: null,
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(seats.eventId, order.eventId), inArray(seats.id, seatIds)));
    }

    await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
        paystackChannel: verified.channel ?? null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
  });

  // Postgres now owns these seats, so release the Redis window immediately
  // instead of making the next buyer wait out the remaining TTL.
  // (Compare-and-delete, so this cannot clobber a newer hold.)
  await releaseHold(order.eventId, order.holdId, seatIds);

  revalidatePath(`/marketplace/events/${order.eventId}`);
  revalidatePath(`/checkout/${order.holdId}`);

  console.info(`[paystack] order ${reference} paid; ${seatIds.length} seat(s) sold`);
}

async function revertRefundedOrder(reference: string | undefined) {
  if (!reference) return;

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  if (!order || order.status === "refunded") return;

  const items = await db
    .select({ seatId: orderItems.seatId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const seatIds = items.map((item) => item.seatId);

  await db.transaction(async (tx) => {
    if (seatIds.length > 0) {
      // Relisting a refunded seat is a policy decision; the starter re-lists it.
      await tx
        .update(seats)
        .set({ status: "available", isListed: true, updatedAt: new Date() })
        .where(and(eq(seats.eventId, order.eventId), inArray(seats.id, seatIds)));
    }

    await tx
      .update(orders)
      .set({ status: "refunded", refundedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  });

  revalidatePath(`/marketplace/events/${order.eventId}`);
}
