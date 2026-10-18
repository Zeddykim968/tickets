import { NextResponse } from "next/server";
import { getEventAvailability } from "@/features/events/availability";

// Never prerender or cache: this reflects live Redis locks.
export const dynamic = "force-dynamic";

/**
 * GET /api/events/[eventId]/availability
 *
 * The single source of truth for the "12 seats left" badges on the section
 * cards and the greyed-out rows in the listing feed. Replacing this with a
 * WebSocket/SSE push later is a server-side change only - the payload shape
 * stays the same.
 *
 * Returns 503 rather than an empty payload on failure, so the client keeps
 * rendering its last known-good snapshot instead of flashing "sold out".
 */
export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;

  try {
    const payload = await getEventAvailability(eventId);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[availability] failed for event", eventId, error);
    return NextResponse.json({ error: "availability_unavailable" }, { status: 503 });
  }
}
