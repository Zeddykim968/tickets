import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/constants";
import { listNowPaymentsCurrencies } from "@/lib/nowpayments/client";

const CACHE_TTL_MS = 10 * 60 * 1000;
let currencyCache: { expiresAt: number; data: string[] } | null = null;

export async function GET() {
  const cookieStore = await cookies();
  const sessionEmail = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionEmail) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const now = Date.now();

  if (currencyCache && currencyCache.expiresAt > now) {
    return NextResponse.json({ currencies: currencyCache.data });
  }

  const result = await listNowPaymentsCurrencies();
  currencyCache = { expiresAt: now + CACHE_TTL_MS, data: result.currencies };
  return NextResponse.json({ currencies: result.currencies });
}
