import { NextResponse } from "next/server";
import { getStoredMatch } from "@/lib/ticketmaster/catalog";
import { requestDiscovery } from "@/lib/ticketmaster/client";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";
import { asArray, asObject } from "@/lib/ticketmaster/normalize";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  try {
    const match = await getStoredMatch(matchId);
    if (!match) return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
    const images = asArray(match.raw.images);
    if (images.length > 0) return NextResponse.json({ items: images }, { headers: { "X-Data-Source": "catalog" } });
    const response = asObject(await requestDiscovery(`/events/${encodeURIComponent(matchId)}/images.json`));
    const embeddedImages = asArray(asObject(response?._embedded)?.images);
    return NextResponse.json({ items: embeddedImages }, { headers: { "X-Data-Source": "upstream" } });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
