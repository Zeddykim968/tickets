import { NextResponse } from "next/server";
import { getStoredVenue, upsertDiscoveryVenue } from "@/lib/ticketmaster/catalog";
import { requestDiscovery, TicketmasterApiError } from "@/lib/ticketmaster/client";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";
import { asObject } from "@/lib/ticketmaster/normalize";

export async function GET(_request: Request, context: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await context.params;
  try {
    let venue = await getStoredVenue(venueId);
    let source = "catalog";
    if (!venue) {
      let raw: unknown;
      try {
        raw = await requestDiscovery(`/venues/${encodeURIComponent(venueId)}.json`);
      } catch (error) {
        if (error instanceof TicketmasterApiError && error.status === 404) {
          return NextResponse.json({ error: { code: "venue_not_found", message: "Venue not found.", retryable: false } }, { status: 404 });
        }
        throw error;
      }
      const object = asObject(raw);
      if (!object) throw new Error("Ticketmaster returned an invalid venue response.");
      await upsertDiscoveryVenue(object);
      venue = await getStoredVenue(venueId);
      source = "upstream";
    }
    return NextResponse.json(venue, { headers: { "X-Data-Source": source, "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
