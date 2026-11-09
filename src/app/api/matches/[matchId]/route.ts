import { NextResponse } from "next/server";
import { getEventBySlugOrId, getListings, getSectionSummaries } from "@/features/events/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches/:matchId
 * `matchId` may be a fixture UUID or its public slug.
 */
export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;

  try {
    const event = await getEventBySlugOrId(matchId);
    if (!event) {
      return NextResponse.json({ error: "match_not_found" }, { status: 404 });
    }

    const [sections, listings] = await Promise.all([
      getSectionSummaries(event.id),
      getListings(event.id, { limit: 400 }),
    ]);

    return NextResponse.json(
      { data: { ...event, sections, listings } },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[matches] failed to load fixture details", { matchId, error });
    return NextResponse.json({ error: "match_unavailable" }, { status: 503 });
  }
}
