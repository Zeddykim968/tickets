import { CalendarDays, MapPin, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { eventDateParts, relativeDayLabel } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { EventSummary } from "@/features/events/types";
import { cn } from "@/lib/utils";

/**
 * Server component: no interactivity beyond the link, so it stays out of the
 * client bundle and the date formatting costs nothing at runtime.
 */
export function EventCard({ event }: { event: EventSummary }) {
  const date = eventDateParts(event.startsAt);
  const isSoldOut = event.listingCount === 0;

  return (
    <Link
      href={`/marketplace/events/${event.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="stadium-glow relative flex items-center gap-4 border-b border-border px-5 py-4">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card text-center">
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground">{date.month}</span>
          <span className="text-lg font-bold leading-none tabular-nums">{date.day}</span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight">
            {event.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {event.awayTeam}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {event.venueName}, {event.venueCity}
          </p>
        </div>

        <Badge variant={isSoldOut ? "muted" : "accent"} className="ml-auto shrink-0">
          {isSoldOut ? "No tickets" : relativeDayLabel(event.startsAt)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3" />
            {date.weekday} · {date.time}
            {event.competition && <span>· {event.competition}</span>}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3" />
            {event.listingCount} ticket{event.listingCount === 1 ? "" : "s"} listed
          </p>
        </div>

        <div className="text-right">
          {event.minPriceCents != null ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                from
              </p>
              <p className="text-lg font-bold tabular-nums transition-colors group-hover:text-primary">
                {formatMoney(event.minPriceCents, event.currency, { compact: true })}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">Unavailable</p>
          )}
        </div>
      </div>
    </Link>
  );
}
