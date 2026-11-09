import { NextResponse } from "next/server";
import { listEvents } from "@/features/events/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches?limit=24
 * Public fixture feed backed by the same PostgreSQL records used by /marketplace.
 */
export async function GET(request: Request) {
  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam === null ? 24 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "limit must be an integer between 1 and 100" }, { status: 400 });
  }

  try {
    const matches = await listEvents({ limit });
    return NextResponse.json(
      { data: matches },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("[matches] failed to load fixtures", error);
    return NextResponse.json({ error: "matches_unavailable" }, { status: 503 });
  }
}
