import { NextResponse } from "next/server";
import { z } from "zod";
import { listStoredVenues } from "@/lib/ticketmaster/catalog";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(3).optional(),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_query", message: "Invalid venue filters.", retryable: false } }, { status: 400 });
  }
  try {
    return NextResponse.json(await listStoredVenues(parsed.data), { headers: { "X-Data-Source": "catalog" } });
  } catch (error) {
    return ticketmasterErrorResponse(error);
  }
}
