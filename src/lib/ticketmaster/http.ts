import { NextResponse } from "next/server";
import { TicketmasterApiError } from "@/lib/ticketmaster/client";

export function ticketmasterErrorResponse(error: unknown) {
  if (error instanceof TicketmasterApiError) {
    const retryable = error.status === 429 || error.status >= 500;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, retryable } },
      { status: error.status },
    );
  }
  console.error("[ticketmaster] request failed", error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Ticketmaster data is temporarily unavailable.", retryable: true } },
    { status: 503 },
  );
}
