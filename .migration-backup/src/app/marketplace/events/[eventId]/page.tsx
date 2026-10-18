import { CalendarDays, MapPin, TrendingUp, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SetupNotice } from "@/components/setup-notice";
import { getEventAvailability } from "@/features/events/availability";
import { EventMarketplaceView } from "@/features/events/components/event-marketplace-view";
import { getEventBySlugOrId, getListings, getSectionSummaries } from "@/features/events/queries";
import { platformFeeBps } from "@/features/orders/pricing";
import { holdTtlSeconds } from "@/lib/env";
import { formatEventDateTime, relativeDayLabel } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { tryQuery } from "@/lib/safe-query";

// Availability depends on live Redis keys; nothing about this page is cacheable.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ eventId: string }> };

/**
 * Metadata is resolved from the fixture so shared links carry the fixture name
 * even before hydration. Failures degrade to a bare title rather than a 500:
 * a metadata read must never take the page down.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params;

  try {
    const event = await getEventBySlugOrId(eventId);
    if (!event) return { title: "Event not found" };

    return {
      title: `${event.homeTeam} vs ${event.awayTeam}`,
      description: `Buy tickets for ${event.homeTeam} vs ${event.awayTeam} at ${event.venueName}, ${event.venueCity}. Live seat map, real availability, 10-minute holds.`,
    };
  } catch {
    return { title: "Event" };
  }
}

/**
 * The stadium page - the heart of the marketplace, and the only route that
 * joins all three data sources (Postgres listings, Redis locks, section
 * geometry) in a single render.
 *
 * Data flow: the event lookup, section summaries and listings each run under
 * `tryQuery`, so a machine without a configured database still renders the
 * shell with a "Data layer not configured" banner instead of a 500. The
 * summaries are passed into `getEventAvailability` so the first snapshot costs
 * no duplicate query, and the whole bundle is handed to
 * `EventMarketplaceView`, which owns the single polling loop from then on.
 */
export default async function EventPage({ params }: PageProps) {
  const { eventId } = await params;

  const { data: event, error: eventError } = await tryQuery(
    "getEventBySlugOrId",
    () => getEventBySlugOrId(eventId),
    null,
  );

  if (eventError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <SetupNotice detail={eventError} />
      </div>
    );
  }

  if (!event) notFound();

  // One round of parallel reads, then hand everything to the client shell.
  // These are independent of each other; only the availability snapshot below
  // depends on the section summaries.
  const [{ data: sectionSummaries }, { data: listings }] = await Promise.all([
    tryQuery("getSectionSummaries", () => getSectionSummaries(event.id), []),
    tryQuery("getListings", () => getListings(event.id, { limit: 400 }), []),
  ]);

  const { data: availability, error: availabilityError } = await tryQuery(
    "getEventAvailability",
    () => getEventAvailability(event.id, sectionSummaries),
    {
      eventId: event.id,
      generatedAt: new Date().toISOString(),
      lockedSeatIds: [],
      sections: [],
    },
  );

  const cheapest = listings.reduce<number | null>(
    (min, listing) =>
      listing.status === "available" ? Math.min(min ?? listing.priceCents, listing.priceCents) : min,
    null,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="stadium-glow rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{relativeDayLabel(event.startsAt)}</Badge>
          {event.competition && (
            <Badge variant="outline">
              <Trophy />
              {event.competition}
            </Badge>
          )}
          <Badge variant="muted">{event.capacity.toLocaleString("en-GB")} capacity</Badge>
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
          {event.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {event.awayTeam}
        </h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {formatEventDateTime(event.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {event.venueName}, {event.venueCity}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="size-3.5" />
            {listings.length} listing{listings.length === 1 ? "" : "s"}
          </span>
        </p>

        {cheapest != null && (
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">Tickets from </span>
            <span className="text-lg font-bold tabular-nums text-primary">
              {formatMoney(cheapest, event.currency, { compact: true })}
            </span>
          </p>
        )}
      </header>

      {availabilityError && (
        <div className="mt-6">
          <SetupNotice detail={availabilityError} />
        </div>
      )}

      <div className="mt-8">
        <EventMarketplaceView
          eventId={event.id}
          currency={event.currency}
          feeBps={platformFeeBps()}
          ttlSeconds={holdTtlSeconds()}
          sections={sectionSummaries}
          listings={listings}
          initialAvailability={availability}
        />
      </div>
    </div>
  );
}
