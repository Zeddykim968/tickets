"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { findHoldEventId, readHold } from "@/features/holds/redis";
import { getOrderByHoldId } from "@/features/orders/queries";
import { checkoutCallbackUrl, initializeTransaction, PaystackError } from "./paystack";

export type InitializePaymentResult =
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; code: "expired" | "not_found" | "already_paid" | "error"; message: string };

/**
 * Start a Paystack transaction for an existing hold.
 *
 * The amount is read from the **order row**, not from the client and not from
 * the Redis manifest: Postgres is the accounting record, and the webhook later
 * compares Paystack's verified amount against that exact same column.
 *
 * The order `reference` is reused across retries. Paystack treats a repeat
 * initialize for a still-pending reference as idempotent, which is precisely
 * the behaviour we want when a buyer's card is declined and they try again.
 */
export async function initializePaymentAction(input: {
  holdId: string;
}): Promise<InitializePaymentResult> {
  const parsed = z.object({ holdId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "not_found", message: "That checkout link is not valid." };
  }

  const { holdId } = parsed.data;

  try {
    const eventId = await findHoldEventId(holdId);
    if (!eventId) {
      return {
        ok: false,
        code: "expired",
        message: "Your hold has expired and the seats were released.",
      };
    }

    const hold = await readHold(eventId, holdId);
    if (!hold) {
      return {
        ok: false,
        code: "expired",
        message: "Your hold has expired and the seats were released.",
      };
    }

    const order = await getOrderByHoldId(holdId);
    if (!order) {
      return { ok: false, code: "not_found", message: "We could not find that order." };
    }

    if (order.status === "paid") {
      return { ok: false, code: "already_paid", message: "This order has already been paid." };
    }

    const transaction = await initializeTransaction({
      email: order.buyerEmail,
      // Integer minor units, straight off the row Paystack will be reconciled against.
      amount: order.totalCents,
      reference: order.reference,
      callbackUrl: checkoutCallbackUrl(holdId),
      currency: order.currency,
      metadata: {
        holdId,
        orderId: order.id,
        eventId,
        seatCount: hold.seatIds.length,
        // Rendered in the Paystack dashboard for support.
        custom_fields: [
          { display_name: "Order", variable_name: "order_reference", value: order.reference },
          { display_name: "Seats", variable_name: "seat_count", value: String(hold.seatIds.length) },
        ],
      },
    });

    await getDb()
      .update(orders)
      .set({
        paystackAuthorizationUrl: transaction.authorization_url,
        paystackAccessCode: transaction.access_code,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      ok: true,
      authorizationUrl: transaction.authorization_url,
      reference: transaction.reference,
    };
  } catch (error) {
    if (error instanceof PaystackError) {
      console.error("[checkout] Paystack initialize failed:", error.message, error.statusCode);
      return {
        ok: false,
        code: "error",
        message: "Paystack could not start that payment. Please try again.",
      };
    }

    console.error("[checkout] initializePayment failed:", error);
    return { ok: false, code: "error", message: "Something went wrong starting the payment." };
  }
}
