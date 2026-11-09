import { NextResponse } from "next/server";
import { z } from "zod";
import { listStoredMatches } from "@/lib/ticketmaster/catalog";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  sport: z.string().trim().max(80).optional(),
  teamId: z.string().trim().max(100).optional(),
  venueId: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(20).optional(),
  country: z.string().trim().max(3).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  onsale: z.enum(["true", "false"]).optional(),
  near: z.string().optional(),
  radiusKm: z.coerce.number().positive().max(500).default(25),
  sort: z.enum(["date,asc", "date,desc", "relevance,desc", "distance,asc", "name,asc"]).default("date,asc"),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "invalid_query", message: "One or more search parameters are invalid.", retryable: false },
    }, { status: 400 });
  }
  if (parsed.data.page * parsed.data.size >= 1000) {
    return NextResponse.json({
      error: { code: "deep_paging_limit", message: "Use filters so page * size stays below 1000.", retryable: false },
    }, { status: 400 });
  }
  if (parsed.data.from && parsed.data.to && new Date(parsed.data.from) > new Date(parsed.data.to)) {
    return NextResponse.json({
      error: { code: "invalid_date_range", message: "from must be earlier than to.", retryable: false },
    }, { status: 400 });
  }

  let near: { latitude: number; longitude: number; radiusKm: number } | undefined;
  if (parsed.data.near) {
    const coordinates = parsed.data.near.split(",").map(Number);
    if (
      coordinates.length !== 2 ||
      !coordinates.every(Number.isFinite) ||
      Math.abs(coordinates[0]) > 90 ||
      Math.abs(coordinates[1]) > 180
    ) {
      return NextResponse.json({
        error: { code: "invalid_near", message: "near must be latitude,longitude.", retryable: false },
      }, { status: 400 });
    }
    near = { latitude: coordinates[0], longitude: coordinates[1], radiusKm: parsed.data.radiusKm };
  }
  if (parsed.data.sort === "distance,asc" && !near) {
    return NextResponse.json({
      error: { code: "near_required", message: "distance,asc sorting requires near=latitude,longitude.", retryable: false },
    }, { status: 400 });
  }
  if (parsed.data.sort === "relevance,desc" && !parsed.data.q) {
    return NextResponse.json({
      error: { code: "q_required", message: "relevance,desc sorting requires q.", retryable: false },
    }, { status: 400 });
  }

  try {
    const result = await listStoredMatches({
      ...parsed.data,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
      near,
      onsale: parsed.data.onsale === "true",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60", "X-Data-Source": "catalog" },
    });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
