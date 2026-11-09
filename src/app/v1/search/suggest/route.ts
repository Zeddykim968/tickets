import { asc, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { ticketmasterMatches, ticketmasterTeams, ticketmasterVenues } from "@/db/schema";

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const query = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!query.success) {
    return NextResponse.json({ error: { code: "invalid_query", message: "q must contain 2 to 100 characters.", retryable: false } }, { status: 400 });
  }
  try {
    const pattern = `%${query.data}%`;
    const db = getDb();
    const [matches, teams, venues] = await Promise.all([
      db.select({ id: ticketmasterMatches.id, name: ticketmasterMatches.name, startUtc: ticketmasterMatches.startUtc })
        .from(ticketmasterMatches).where(ilike(ticketmasterMatches.name, pattern)).orderBy(asc(ticketmasterMatches.startUtc)).limit(5),
      db.select({ id: ticketmasterTeams.id, name: ticketmasterTeams.name })
        .from(ticketmasterTeams).where(ilike(ticketmasterTeams.name, pattern)).orderBy(asc(ticketmasterTeams.name)).limit(5),
      db.select({ id: ticketmasterVenues.id, name: ticketmasterVenues.name, city: ticketmasterVenues.city })
        .from(ticketmasterVenues).where(ilike(ticketmasterVenues.name, pattern)).orderBy(asc(ticketmasterVenues.name)).limit(5),
    ]);
    return NextResponse.json({
      items: [
        ...matches.map((item) => ({ type: "match", ...item })),
        ...teams.map((item) => ({ type: "team", ...item })),
        ...venues.map((item) => ({ type: "venue", ...item })),
      ],
    }, { headers: { "X-Data-Source": "catalog" } });
  } catch (error) {
    console.error("[ticketmaster] search suggestion failed", error);
    return NextResponse.json({ error: { code: "catalog_unavailable", message: "Suggestions are temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
