import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoredMatch } from "@/lib/ticketmaster/catalog";

export const dynamic = "force-dynamic";

async function loadMatch(matchId: string) {
  return getStoredMatch(matchId);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchId: string }>;
}): Promise<Metadata> {
  const { matchId } = await params;
  try {
    const match = await getStoredMatch(matchId);
    return { title: match?.name ?? "Sports event" };
  } catch {
    return { title: "Sports event" };
  }
}

export default async function TicketmasterEventPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  let match: Awaited<ReturnType<typeof getStoredMatch>> = null;
  try {
    match = await loadMatch(matchId);
  } catch (error) {
    console.error("[ticketmaster-page] event detail unavailable", error);
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-bold">Event details unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check that Ticketmaster API credentials are configured and try again later.
        </p>
      </main>
    );
  }
  if (!match) notFound();

  const date = match.startUtc
    ? new Date(match.startUtc).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })
    : [match.localDate, match.localTime].filter(Boolean).join(" ") || "Date to be announced";
  const validCurrency = /^[A-Z]{3}$/.test(match.priceRange.currency ?? "");
  const price = match.priceRange.min === null || !validCurrency
    ? "Price not listed"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency: match.priceRange.currency!,
      }).format(match.priceRange.min);
  const maxPrice = match.priceRange.max !== null && validCurrency
    ? new Intl.NumberFormat("en", { style: "currency", currency: match.priceRange.currency! }).format(match.priceRange.max)
    : null;
  const purchaseLink = `/v1/matches/${encodeURIComponent(match.id)}/purchase-link?redirect=true`;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <Link href="/ticketmaster" className="text-sm font-semibold text-primary hover:underline">
        ← All sports events
      </Link>
      <article className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{match.status ?? "Sale status unavailable"}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{match.name}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{date}</p>
        {match.venue && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-semibold">{match.venue.name}</span>
            {match.venue.city ? ` · ${match.venue.city}` : ""}
          </p>
        )}
        {match.teams.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {match.teams.map((team) => (
              <li key={team.id} className="rounded-full border border-border px-3 py-1 text-xs">
                {team.name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-lg font-bold">
          {price}
          {maxPrice ? ` – ${maxPrice}` : ""}
          {match.priceRange.min !== null && validCurrency && <span className="ml-2 text-xs font-normal text-muted-foreground">indicative range</span>}
        </p>
        {match.seatmap.staticImageUrl && (
          // Ticketmaster provides this official static image URL; it is not a seat-by-seat inventory feed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.seatmap.staticImageUrl} alt={`Static venue seat map for ${match.name}`} className="mt-6 max-h-96 w-full rounded-xl object-contain" />
        )}
        <a
          href={purchaseLink}
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Continue to Ticketmaster
        </a>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Ticketmaster Discovery does not provide complete seat inventory. Ticket purchase and final
          pricing happen on Ticketmaster; NOWPayments is only available for tickets sold through this site&apos;s own inventory.
        </p>
      </article>
    </main>
  );
}
