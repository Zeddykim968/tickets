import { NextResponse } from "next/server";
import { getStoredMatch, upsertDiscoveryEvent } from "@/lib/ticketmaster/catalog";
import { requestDiscovery, TicketmasterApiError } from "@/lib/ticketmaster/client";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";
import { asObject } from "@/lib/ticketmaster/normalize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  try {
    let match = await getStoredMatch(matchId);
    let source = "catalog";
    if (!match) {
      let raw: unknown;
      try {
        raw = await requestDiscovery(`/events/${encodeURIComponent(matchId)}.json`, { includeTest: "no" });
      } catch (error) {
        if (error instanceof TicketmasterApiError && error.status === 404) {
          return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
        }
        throw error;
      }
      const event = asObject(raw);
      if (!event) throw new Error("Ticketmaster returned an invalid event response.");
      await upsertDiscoveryEvent(event);
      match = await getStoredMatch(matchId);
      source = "upstream";
    }
    if (!match) {
      return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
    }
    return NextResponse.json(match, { headers: { "X-Data-Source": source, "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
