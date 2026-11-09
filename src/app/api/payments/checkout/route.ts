import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { payments, users } from "@/db/schema/nowpayments";
import { findHoldEventId, readHold } from "@/features/holds/redis";
import { createNowPaymentsInvoice } from "@/lib/nowpayments/client";
import { nowPaymentsConfig } from "@/lib/nowpayments/config";

const checkoutSchema = z.object({ holdId: z.string().uuid() });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout payload" }, { status: 400 });
  }

  try {
    const holdId = parsed.data.holdId;
    const eventId = await findHoldEventId(holdId);
    if (!eventId || !(await readHold(eventId, holdId))) {
      return NextResponse.json({ error: "Your seat hold has expired." }, { status: 410 });
    }

    const db = getDb();
    const [order] = await db.select().from(orders).where(eq(orders.holdId, holdId)).limit(1);
    if (!order) {
      return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
    }
    if (order.status === "paid") {
      return NextResponse.json({ error: "This order has already been paid." }, { status: 409 });
    }
    if (order.status !== "pending" || order.expiresAt <= new Date()) {
      return NextResponse.json({ error: "Your seat hold has expired." }, { status: 410 });
    }

    const config = nowPaymentsConfig();
    const appUrl = config.APP_URL.replace(/\/$/, "");
    const [userRecord] = await db
      .insert(users)
      .values({ email: order.buyerEmail, name: order.buyerName })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: order.buyerName, updatedAt: new Date() },
      })
      .returning();

    if (!userRecord) throw new Error("Payment customer record could not be loaded");

    let [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (
      payment?.payUrl &&
      ["pending", "processing", "under_review"].includes(payment.status)
    ) {
      return NextResponse.json({ payUrl: payment.payUrl });
    }
    if (payment?.status === "processing") {
      return NextResponse.json({ error: "Your NOWPayments checkout is still starting. Please try again shortly." }, { status: 409 });
    }
    if (payment?.status === "paid" || payment?.status === "under_review") {
      return NextResponse.json({ error: "This payment is already being reviewed." }, { status: 409 });
    }

    if (payment) {
      if (payment.status === "failed" || payment.status === "expired") {
        [payment] = await db
          .update(payments)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(payments.id, payment.id))
          .returning();
      }
    } else {
      [payment] = await db
        .insert(payments)
        .values({
          userId: userRecord.id,
          orderId: order.id,
          amount: order.totalCents,
          currency: order.currency,
          status: "pending",
        })
        .returning();
    }
    if (!payment) throw new Error("NOWPayments payment record could not be created");

    const [claimedPayment] = await db
      .update(payments)
      .set({
        amount: order.totalCents,
        currency: order.currency,
        status: "processing",
        nowpaymentsInvoiceId: null,
        payUrl: null,
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(payments.id, payment.id),
        inArray(payments.status, ["pending", "failed", "expired"]),
      ))
      .returning({ id: payments.id });
    if (!claimedPayment) {
      return NextResponse.json({ error: "Your NOWPayments checkout is already being prepared." }, { status: 409 });
    }

    let result: Awaited<ReturnType<typeof createNowPaymentsInvoice>>;
    try {
      result = await createNowPaymentsInvoice({
        price_amount: order.totalCents / 100,
        price_currency: order.currency.toLowerCase(),
        order_id: payment.id,
        order_description: `FrontRow ticket order ${order.reference}`,
        ipn_callback_url: `${appUrl}/api/nowpayments/webhook`,
        success_url: `${appUrl}/checkout/${holdId}?payment=returned`,
        cancel_url: `${appUrl}/checkout/${holdId}?payment=returned`,
      });
    } catch (error) {
      await db
        .update(payments)
        .set({
          status: "failed",
          failureMessage: error instanceof Error ? error.message : "NOWPayments invoice creation failed",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      throw error;
    }

    await db
      .update(payments)
      .set({
        nowpaymentsInvoiceId: result.id,
        payUrl: result.invoice_url,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    return NextResponse.json({ payUrl: result.invoice_url });
  } catch (error) {
    console.error("[checkout] NOWPayments initialization failed:", error);
    return NextResponse.json(
      { error: "NOWPayments could not start that payment. Please try again." },
      { status: 502 },
    );
  }
}
