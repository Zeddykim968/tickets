"use client";

import { ArrowDownUp, Filter, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHoldStore } from "@/stores/hold-selection-store";
import type { CurrencyCode, ListingSort, TicketListing, ViewQuality } from "@/features/events/types";
import { cn } from "@/lib/utils";
import { ListingRow } from "./listing-row";

export type ListingFeedProps = {
  listings: TicketListing[];
  currency: CurrencyCode;
  /** Live seat ids currently inside a 10-minute window. */
  lockedSeatIds: string[];
};

const SORT_OPTIONS: Array<{ value: ListingSort; label: string }> = [
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "row", label: "Row order" },
  { value: "best_value", label: "Biggest saving" },
];

const QUALITY_FILTERS: Array<{ value: "all" | "clear_plus" | "premium" | "only_restricted"; label: string }> = [
  { value: "all", label: "All views" },
  { value: "clear_plus", label: "Clear or better" },
  { value: "premium", label: "Premium only" },
  { value: "only_restricted", label: "Restricted (cheaper)" },
];

const QUALITY_SETS: Record<string, ViewQuality[]> = {
  clear_plus: ["premium", "clear"],
  premium: ["premium"],
  only_restricted: ["restricted", "obstructed"],
};

/**
 * The ticket feed.
 *
 * Filtering and sorting happen client-side against the listings the server
 * already sent. For a single fixture that is at most a few hundred rows and it
 * keeps section switching instant; past that, move the filters into the query
 * in `features/events/queries.ts` and read them from the URL.
 */
export function ListingFeed({ listings, currency, lockedSeatIds }: ListingFeedProps) {
  const activeSectionId = useHoldStore((state) => state.activeSectionId);
  const activateSection = useHoldStore((state) => state.activateSection);
  const selectedSeats = useHoldStore((state) => state.selectedSeats);
  const toggleSeat = useHoldStore((state) => state.toggleSeat);

  const sort = useHoldStore((state) => state.sort);
  const setSort = useHoldStore((state) => state.setSort);
  const viewFilter = useHoldStore((state) => state.viewFilter);
  const setViewFilter = useHoldStore((state) => state.setViewFilter);
  const hideSold = useHoldStore((state) => state.hideSold);
  const toggleHideSold = useHoldStore((state) => state.toggleHideSold);

  const locked = useMemo(() => new Set(lockedSeatIds), [lockedSeatIds]);
  const selectedIds = useMemo(() => new Set(selectedSeats.map((seat) => seat.id)), [selectedSeats]);

  // A fixture can carry several hundred listings. Rendering them all buries
  // the buyer in DOM and scroll, so the feed pages in as they read.
  const [rowLimit, setRowLimit] = useState(30);
  useEffect(() => setRowLimit(30), [activeSectionId, viewFilter, hideSold, sort, listings]);

  const activeSection = useMemo(
    () => listings.find((listing) => listing.sectionId === activeSectionId) ?? null,
    [listings, activeSectionId],
  );

  const visible = useMemo(() => {
    const qualities = qualitySetFor(viewFilter);

    const filtered = listings.filter((listing) => {
      if (activeSectionId && listing.sectionId !== activeSectionId) return false;
      if (hideSold && listing.status === "sold") return false;
      if (qualities && !qualities.includes(listing.viewQuality)) return false;
      return true;
    });

    const comparators: Record<ListingSort, (a: TicketListing, b: TicketListing) => number> = {
      price_asc: (a, b) => a.priceCents - b.priceCents,
      price_desc: (a, b) => b.priceCents - a.priceCents,
      row: (a, b) => a.rowLabel.localeCompare(b.rowLabel, undefined, { numeric: true }) || compareSeat(a, b),
      best_value: (a, b) => b.savingsCents - a.savingsCents || a.priceCents - b.priceCents,
    };

    return [...filtered].sort(comparators[sort]);
  }, [listings, activeSectionId, hideSold, viewFilter, sort]);

  // Seats the buyer picked that a filter would otherwise hide.
  const hiddenSelectedCount = useMemo(() => {
    const visibleIds = new Set(visible.map((listing) => listing.id));
    return selectedSeats.filter((seat) => !visibleIds.has(seat.id)).length;
  }, [visible, selectedSeats]);

  const handleToggle = useCallback(
    (listing: TicketListing) => {
      toggleSeat({
        id: listing.id,
        sectionId: listing.sectionId,
        priceCents: listing.priceCents,
        originalPriceCents: listing.originalPriceCents,
        sectionCode: listing.sectionCode,
        sectionName: listing.sectionName,
        rowLabel: listing.rowLabel,
        seatNumber: listing.seatNumber,
        category: listing.category,
        viewQuality: listing.viewQuality,
      });
    },
    [toggleSeat],
  );

  return (
    <section className="space-y-4" aria-labelledby="listings-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="listings-heading" className="text-lg font-semibold tracking-tight">
            {activeSection ? `${activeSection.sectionCode} · ${activeSection.sectionName}` : "All tickets"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {visible.length} listing{visible.length === 1 ? "" : "s"}
            {activeSectionId && " in this section"} · prices include row and seat number
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSectionId && (
            <button
              type="button"
              onClick={() => activateSection(activeSectionId)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <X className="size-3" />
              Clear section
            </button>
          )}

          <label className="relative inline-flex items-center">
            <ArrowDownUp className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ListingSort)}
              aria-label="Sort listings"
              className="h-8 appearance-none rounded-full border border-border bg-card pl-8 pr-3 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" />
          View
        </span>
        {QUALITY_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setViewFilter(option.value)}
            aria-pressed={viewFilter === option.value}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
              viewFilter === option.value
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleHideSold}
          aria-pressed={hideSold}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
            hideSold
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Hide sold
        </button>
      </div>

      {hiddenSelectedCount > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {hiddenSelectedCount} selected seat{hiddenSelectedCount === 1 ? "" : "s"} hidden by the current
          filter — they are still in your hold.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-semibold">No tickets match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try “All views”, or pick a different section on the map.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.slice(0, rowLimit).map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                currency={currency}
                isInCart={locked.has(listing.id)}
                isSelected={selectedIds.has(listing.id)}
                onToggle={handleToggle}
              />
            ))}
          </ul>

          {visible.length > rowLimit && (
            <button
              type="button"
              onClick={() => setRowLimit((limit) => limit + 30)}
              className="w-full rounded-xl border border-border bg-card py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Show {Math.min(30, visible.length - rowLimit)} more of {visible.length} listings
            </button>
          )}
        </>
      )}
    </section>
  );
}

function qualitySetFor(filter: string): ViewQuality[] | null {
  return QUALITY_SETS[filter] ?? null;
}

function compareSeat(a: TicketListing, b: TicketListing) {
  return a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true });
}
