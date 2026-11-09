import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { ticketmasterDailyUsage, ticketmasterQuotaSnapshot } from "@/lib/ticketmaster/client";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Admin authentication required.", retryable: false } }, { status: 401 });
  }
  try {
    return NextResponse.json({
      discovery: await ticketmasterQuotaSnapshot(),
      localDailyCalls: await ticketmasterDailyUsage(),
      dailySyncPauseAt: 4_000,
      localHardLimit: 5_000,
    });
  } catch (error) {
    console.error("[ticketmaster] quota snapshot lookup failed", error);
    return NextResponse.json({ error: { code: "quota_unavailable", message: "Quota information is temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
