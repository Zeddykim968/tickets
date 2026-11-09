import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    tier: "T1",
    browse: true,
    liveAvailability: false,
    seatRecommendations: false,
    inAppCheckout: false,
    purchaseMode: "redirect",
    checkoutProvider: "NOWPayments hosted crypto invoices are reserved for first-party marketplace inventory.",
  });
}
