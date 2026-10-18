import { createHmac, timingSafeEqual } from "node:crypto";
import { paystackSecretKey, publicEnv } from "@/lib/env";

const PAYSTACK_API = "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

export type InitializeTransactionPayload = {
  /** Buyer email. Paystack sends the receipt here. */
  email: string;
  /** Amount in the currency's minor unit - kobo for NGN. No float maths. */
  amount: number;
  /** Our own unique order reference; also the webhook correlation key. */
  reference: string;
  callbackUrl: string;
  currency?: string;
  metadata?: Record<string, unknown>;
  channels?: Array<"card" | "bank" | "ussd" | "qr" | "mobile_money" | "bank_transfer">;
};

export type InitializedTransaction = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

/**
 * POST /transaction/initialize
 *
 * `amount` is the *integer minor unit* total straight off the order row, which
 * is exactly the shape Paystack wants - so there is no conversion step where a
 * rounding bug could sneak in.
 */
export async function initializeTransaction(
  payload: InitializeTransactionPayload,
): Promise<InitializedTransaction> {
  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: payload.email,
      amount: payload.amount,
      reference: payload.reference,
      callback_url: payload.callbackUrl,
      currency: payload.currency ?? "NGN",
      metadata: payload.metadata,
      channels: payload.channels,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as PaystackResponse<InitializedTransaction> | null;

  if (!response.ok || !body?.status) {
    throw new PaystackError(body?.message ?? "Paystack rejected the transaction", response.status);
  }

  return body.data;
}

export type VerifiedTransaction = {
  id: number;
  status: "success" | "failed" | "abandoned" | "reversed" | "ongoing" | "pending";
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string;
  customer?: { email?: string };
};

/**
 * GET /transaction/verify/:reference
 *
 * The webhook payload is only trusted as a *trigger*; the authoritative
 * amount/status comes from here. That is what stops a forged-but-correctly-
 * signed replay from marking a ₦5,000 order paid on a ₦500 charge.
 */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey()}` },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as PaystackResponse<VerifiedTransaction> | null;

  if (!response.ok || !body?.status) {
    throw new PaystackError(body?.message ?? "Could not verify the transaction", response.status);
  }

  return body.data;
}

/**
 * Paystack signs the **raw request body** with HMAC-SHA512 using the secret
 * key and puts the hex digest in the `x-paystack-signature` header.
 *
 * This is why the webhook route reads `await request.text()` and only then
 * parses: `JSON.stringify(JSON.parse(body))` reorders keys and would break the
 * digest. Comparison is constant-time to avoid leaking the expected digest.
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null | undefined): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", paystackSecretKey())
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** Where Paystack should send the buyer back to once they've paid. */
export function checkoutCallbackUrl(holdId: string) {
  return `${publicEnv().appUrl.replace(/\/$/, "")}/checkout/${holdId}`;
}
