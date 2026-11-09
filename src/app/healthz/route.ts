import { NextResponse } from "next/server";
import { getDb, ticketmasterMatches } from "@/db";
import { getRedis } from "@/features/holds/redis";
import { lastTicketmasterSync } from "@/lib/ticketmaster/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, redis, lastSync] = await Promise.all([
    getDb().select({ id: ticketmasterMatches.id }).from(ticketmasterMatches).limit(1)
      .then(() => "ok" as const)
      .catch(() => "unavailable" as const),
    getRedis().ping().then(() => "ok" as const).catch(() => "unavailable" as const),
    lastTicketmasterSync().catch(() => null),
  ]);
  const healthy = database === "ok" && redis === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", database, redis, lastSuccessfulSync: lastSync },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
