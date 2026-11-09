import { NextResponse } from "next/server";
import { getStoredMatch } from "@/lib/ticketmaster/catalog";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  try {
    const match = await getStoredMatch(matchId);
    if (!match) return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
    return NextResponse.json({
      matchId,
      staticImageUrl: match.seatmap.staticImageUrl,
      source: "discovery",
      fullSeatInventory: false,
    });
  } catch (error) {
    console.error("[ticketmaster] seatmap lookup failed", error);
    return NextResponse.json({ error: { code: "catalog_unavailable", message: "Seat map is temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
