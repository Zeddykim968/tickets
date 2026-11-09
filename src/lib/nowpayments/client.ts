import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { nowPaymentsConfig } from "@/lib/nowpayments/config";
import {
  nowPaymentsCurrenciesResponseSchema,
  nowPaymentsInvoiceRequestSchema,
  nowPaymentsInvoiceResponseSchema,
  type NowPaymentsInvoiceRequest,
} from "@/lib/nowpayments/types";

export class NowPaymentsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NowPaymentsApiError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(
      ([key, nestedValue]) => [key, sortKeys(nestedValue)],
    ),
  );
}

export function verifyNowPaymentsSignature(
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const config = nowPaymentsConfig();
  const expected = createHmac("sha512", config.NOWPAYMENTS_IPN_SECRET)
    .update(JSON.stringify(sortKeys(payload)), "utf8")
    .digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const config = nowPaymentsConfig();
  const baseUrl = config.NOWPAYMENTS_BASE_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("x-api-key", config.NOWPAYMENTS_API_KEY);

  try {
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      ...init,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : `NOWPayments API request failed (${response.status})`;
      throw new NowPaymentsApiError(response.status, message);
    }
    if (body === null) throw new NowPaymentsApiError(502, "NOWPayments returned an empty response.");
    return body;
  } catch (error) {
    if (error instanceof NowPaymentsApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NowPaymentsApiError(504, "NOWPayments request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createNowPaymentsInvoice(input: NowPaymentsInvoiceRequest) {
  const parsed = nowPaymentsInvoiceRequestSchema.parse(input);
  const response = await requestJson("/v1/invoice", {
    method: "POST",
    body: JSON.stringify(parsed),
  });
  return nowPaymentsInvoiceResponseSchema.parse(response);
}

export async function listNowPaymentsCurrencies() {
  const response = await requestJson("/v1/currencies", { method: "GET" });
  return nowPaymentsCurrenciesResponseSchema.parse(response);
}
