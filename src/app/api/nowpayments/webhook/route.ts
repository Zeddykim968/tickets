import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { orderItems, orders, seats } from "@/db/schema";
import { payments, webhookEvents, type PaymentStatus } from "@/db/schema/nowpayments";
import { releaseHold } from "@/features/holds/redis";
import { verifyNowPaymentsSignature } from "@/lib/nowpayments/client";
import { canTransitionPayment, mapNowPaymentsStatus } from "@/lib/nowpayments/status";
import { nowPaymentsWebhookPayloadSchema } from "@/lib/nowpayments/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig");

  if (!verifyNowPaymentsSignature(rawBody, signature)) {
    console.warn("[nowpayments-webhook] invalid signature rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const parsed = nowPaymentsWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = parsed.data;
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, event.order_id)).limit(1);

  if (!payment) {
    console.warn("[nowpayments-webhook] payment not found", {
      orderId: event.order_id,
      providerPaymentId: event.payment_id,
    });
    return NextResponse.json({ error: "Payment not found" }, { status: 503 });
  }

  if (
    Math.round(event.price_amount * 100) !== payment.amount ||
    event.price_currency.toUpperCase() !== payment.currency.toUpperCase() ||
    (payment.nowpaymentsInvoiceId !== null &&
      event.invoice_id !== undefined &&
      event.invoice_id !== payment.nowpaymentsInvoiceId)
  ) {
    console.warn("[nowpayments-webhook] invoice details do not match payment", {
      paymentId: payment.id,
      providerPaymentId: event.payment_id,
    });
    return NextResponse.json({ error: "Payment details do not match" }, { status: 400 });
  }

  const nextStatus = mapNowPaymentsStatus(event.payment_status);
  const eventId = `${event.payment_id}:${event.payment_status}`;
  const mutableStatuses: PaymentStatus[] = ["pending", "processing", "under_review"];
  const fulfillment = await db.transaction(async (tx) => {
    const [insertedEvent] = await tx
      .insert(webhookEvents)
      .values({
        eventId,
        paymentId: payment.id,
        status: event.payment_status,
        rawPayload: payload,
        receivedAt: new Date(),
        processedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ eventId: webhookEvents.eventId });

    if (!insertedEvent || !nextStatus || !canTransitionPayment(payment.status, nextStatus)) {
      return null;
    }

    const [updatedPayment] = await tx
      .update(payments)
      .set({
        status: nextStatus,
        failureCode: nextStatus === "failed" ? event.payment_status : null,
        failureMessage: nextStatus === "failed" ? event.error ?? null : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, payment.id),
          eq(payments.status, payment.status),
          inArray(payments.status, mutableStatuses),
        ),
      )
      .returning({ id: payments.id });

    if (!updatedPayment || nextStatus !== "paid" || !payment.orderId) return null;

    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    if (!order || order.status !== "pending") {
      console.warn("[nowpayments-webhook] paid payment has no pending marketplace order", {
        paymentId: payment.id,
        orderId: payment.orderId,
        orderStatus: order?.status,
      });
      return null;
    }

    const items = await tx
      .select({ seatId: orderItems.seatId })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const seatIds = items.map((item) => item.seatId);
    const lockedSeats = seatIds.length
      ? await tx
          .select({ id: seats.id, holdId: seats.holdId, status: seats.status })
          .from(seats)
          .where(and(eq(seats.eventId, order.eventId), inArray(seats.id, seatIds)))
          .for("update")
      : [];

    if (
      lockedSeats.length !== seatIds.length ||
      lockedSeats.some((seat) => seat.holdId !== order.holdId || seat.status === "sold")
    ) {
      await tx
        .update(orders)
        .set({
          status: "failed",
          failedAt: new Date(),
          failureReason: "NOWPayments completed payment after the seats were no longer held; refund review required.",
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
      console.error("[nowpayments-webhook] paid order could not be fulfilled; refund review required", {
        paymentId: payment.id,
        orderId: order.id,
      });
      return null;
    }

    if (seatIds.length > 0) {
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

    const [paidOrder] = await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning({ eventId: orders.eventId, holdId: orders.holdId });

    return paidOrder ? { ...paidOrder, seatIds } : null;
  });

  let completedOrder = fulfillment;
  const orderId = payment.orderId;
  if (!completedOrder && orderId && nextStatus === "paid") {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (order?.status === "paid") {
      const items = await db
        .select({ seatId: orderItems.seatId })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      completedOrder = {
        eventId: order.eventId,
        holdId: order.holdId,
        seatIds: items.map((item) => item.seatId),
      };
    }
  }

  if (completedOrder) {
    await releaseHold(completedOrder.eventId, completedOrder.holdId, completedOrder.seatIds);
    revalidatePath(`/marketplace/events/${completedOrder.eventId}`);
    revalidatePath(`/checkout/${completedOrder.holdId}`);
    console.info(`[nowpayments-webhook] order ${completedOrder.holdId} paid; ${completedOrder.seatIds.length} seat(s) sold`);
  }

  return NextResponse.json({ ok: true });
}
