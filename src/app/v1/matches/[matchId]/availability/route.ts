import { NextResponse } from "next/server";
import { getStoredMatch } from "@/lib/ticketmaster/catalog";
import { mapAvailabilityStatus } from "@/lib/ticketmaster/normalize";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  try {
    const match = await getStoredMatch(matchId);
    if (!match) return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
    const status = mapAvailabilityStatus(
      match.status,
      match.onsaleStart ? new Date(match.onsaleStart) : null,
      match.onsaleEnd ? new Date(match.onsaleEnd) : null,
    );
    return NextResponse.json({
      matchId,
      status,
      priceRange: match.priceRange,
      source: "catalog",
      asOf: new Date().toISOString(),
      ttlSeconds: 30,
      pricesRefreshedAt: match.syncedAt,
      pricesAreIndicative: true,
    }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    console.error("[ticketmaster] availability lookup failed", error);
    return NextResponse.json({ error: { code: "catalog_unavailable", message: "Availability is temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
