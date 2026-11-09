import { NextResponse } from "next/server";
import { getStoredTeam, upsertDiscoveryTeam } from "@/lib/ticketmaster/catalog";
import { requestDiscovery, TicketmasterApiError } from "@/lib/ticketmaster/client";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";
import { asObject } from "@/lib/ticketmaster/normalize";

export async function GET(_request: Request, context: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await context.params;
  try {
    let team = await getStoredTeam(teamId);
    let source = "catalog";
    if (!team) {
      let raw: unknown;
      try {
        raw = await requestDiscovery(`/attractions/${encodeURIComponent(teamId)}.json`);
      } catch (error) {
        if (error instanceof TicketmasterApiError && error.status === 404) {
          return NextResponse.json({ error: { code: "team_not_found", message: "Team or attraction not found.", retryable: false } }, { status: 404 });
        }
        throw error;
      }
      const object = asObject(raw);
      if (!object) throw new Error("Ticketmaster returned an invalid attraction response.");
      await upsertDiscoveryTeam(object);
      team = await getStoredTeam(teamId);
      source = "upstream";
    }
    return NextResponse.json(team, { headers: { "X-Data-Source": source, "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
