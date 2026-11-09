import { NextResponse } from "next/server";
import { getStoredMatch } from "@/lib/ticketmaster/catalog";
import { isTrustedTicketmasterUrl } from "@/lib/ticketmaster/normalize";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  try {
    const match = await getStoredMatch(matchId);
    const url = match?.purchase.url;
    if (!match) return NextResponse.json({ error: { code: "match_not_found", message: "Match not found.", retryable: false } }, { status: 404 });
    if (!url || !isTrustedTicketmasterUrl(url)) {
      return NextResponse.json({ error: { code: "purchase_link_unavailable", message: "Ticketmaster did not provide a valid purchase link.", retryable: false } }, { status: 404 });
    }
    if (new URL(request.url).searchParams.get("redirect") === "true") {
      return NextResponse.redirect(url, 302);
    }
    return NextResponse.json({ mode: "redirect", url });
  } catch (error) {
    console.error("[ticketmaster] purchase link lookup failed", error);
    return NextResponse.json({ error: { code: "catalog_unavailable", message: "Purchase link is temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
