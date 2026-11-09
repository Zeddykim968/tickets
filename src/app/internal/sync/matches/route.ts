import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { ticketmasterErrorResponse } from "@/lib/ticketmaster/http";
import { syncTicketmasterMatches } from "@/lib/ticketmaster/sync";

const syncSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  markets: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Admin authentication required.", retryable: false } }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (!origin || new URL(request.url).origin !== origin) {
    return NextResponse.json({ error: { code: "origin_rejected", message: "Same-origin admin requests only.", retryable: false } }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "Expected a JSON request body.", retryable: false } }, { status: 400 });
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "Invalid sync parameters.", retryable: false } }, { status: 400 });
  }

  try {
    const result = await syncTicketmasterMatches({
      from: new Date(parsed.data.from),
      to: new Date(parsed.data.to),
      markets: parsed.data.markets,
    });
    console.info("[ticketmaster] catalog sync completed", { actor: admin.email, ...result });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ticketmaster] catalog sync failed", { actor: admin.email, error });
    return ticketmasterErrorResponse(error);
  }
}
