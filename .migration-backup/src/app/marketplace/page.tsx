import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import { EventCard } from "@/features/events/components/event-card";
import { listEvents } from "@/features/events/queries";
import { tryQuery } from "@/lib/safe-query";

/**
 * Marketplace index - the feed of fixtures a buyer lands on from the header.
 * Server-rendered with a 30-second revalidate window: listing counts move
 * constantly, but the feed does not need the per-second truth that the event
 * page's availability polling provides.
 */
export const metadata: Metadata = {
  title: "Live sport tickets",
  description: "Every fixture on sale, with live seat maps and real availability.",
};

// Inventory moves constantly; a short window is a good trade between load and freshness.
export const revalidate = 30;

export default async function MarketplacePage() {
  const { data: events, error } = await tryQuery("listEvents", () => listEvents({ limit: 24 }), []);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Tickets on sale</h1>
        <p className="text-sm text-muted-foreground">
          {events.length === 0
            ? "No fixtures are listed yet."
            : `${events.length} fixture${events.length === 1 ? "" : "s"} with tickets from verified sellers.`}
        </p>
      </header>

      {error && <SetupNotice detail={error} />}

      {events.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <CalendarClock className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Nothing on sale yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run <code className="font-mono">npm run db:seed</code> to load a demo stadium.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
