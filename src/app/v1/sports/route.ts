import { NextResponse } from "next/server";
import { listStoredSports } from "@/lib/ticketmaster/catalog";

export async function GET() {
  try {
    return NextResponse.json({ items: await listStoredSports() }, { headers: { "X-Data-Source": "catalog" } });
  } catch (error) {
    console.error("[ticketmaster] sports taxonomy lookup failed", error);
    return NextResponse.json({ error: { code: "catalog_unavailable", message: "Sports taxonomy is temporarily unavailable.", retryable: true } }, { status: 503 });
  }
}
