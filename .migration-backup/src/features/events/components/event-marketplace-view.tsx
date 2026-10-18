"use client";

import { useEffect, useMemo, useState } from "react";
import {
  indexAvailabilityBySection,
  useEventAvailability,
} from "@/app/hooks/use-event-availability";
import { HoldBar } from "@/features/holds/components/hold-bar";
import { ListingFeed } from "@/features/seats/components/listing-feed";
import { useHoldStore } from "@/stores/hold-selection-store";
import type { AvailabilityPayload, CurrencyCode, SectionSummary, TicketListing } from "../types";
import { SectionPicker } from "./section-picker";

export type EventMarketplaceViewProps = {
  eventId: string;
  currency: CurrencyCode;
  feeBps: number;
  /** Server-configured hold lifetime, forwarded so the copy matches the TTL. */
  ttlSeconds: number;
  sections: SectionSummary[];
  listings: TicketListing[];
  initialAvailability: AvailabilityPayload;
};

/**
 * Single owner of the availability polling loop.
 *
 * The map, the section cards and the ticket feed all read from the same
 * snapshot, so a lock can never appear in one panel and be missing from
 * another. One interval, one fetch, one source of truth.
 */
export function EventMarketplaceView({
  eventId,
  currency,
  feeBps,
  ttlSeconds,
  sections,
  listings,
  initialAvailability,
}: EventMarketplaceViewProps) {
  const { data, isRefreshing, isStale, refresh } = useEventAvailability(eventId, initialAvailability);
  const setEvent = useHoldStore((state) => state.setEvent);

  // Hydration-safe clock label: only rendered after mount.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    setEvent(eventId);
  }, [eventId, setEvent]);

  const availabilityBySection = useMemo(() => indexAvailabilityBySection(data), [data]);

  const lastUpdatedLabel = isMounted
    ? `Updated ${new Date(data.generatedAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`
    : "Live";

  return (
    <div className="space-y-10">
      <SectionPicker
        currency={currency}
        sections={sections}
        availabilityBySection={availabilityBySection}
        isRefreshing={isRefreshing}
        isStale={isStale}
        lastUpdatedLabel={lastUpdatedLabel}
        onRefresh={() => void refresh()}
      />

      <ListingFeed listings={listings} currency={currency} lockedSeatIds={data.lockedSeatIds} />

      <HoldBar eventId={eventId} currency={currency} feeBps={feeBps} ttlSeconds={ttlSeconds} />
    </div>
  );
}
