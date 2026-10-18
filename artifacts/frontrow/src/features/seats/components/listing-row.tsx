"use client";

import { Check, Clock, MapPin } from "lucide-react";
import { viewQualityMeta } from "@/features/events/view-quality";
import type { CurrencyCode, TicketListing } from "@/features/events/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ListingRowProps = {
  listing: TicketListing;
  currency: CurrencyCode;
  /** Inside somebody's 10-minute window right now. */
  isInCart: boolean;
  isSelected: boolean;
  onToggle: (listing: TicketListing) => void;
};

/**
 * One seat for sale.
 *
 * `isInCart` comes from the live availability payload, not from the initial
 * render, so a row visibly greys out the moment another buyer claims it -
 * without the buyer having to reload.
 */
export function ListingRow({ listing, currency, isInCart, isSelected, onToggle }: ListingRowProps) {
  const quality = viewQualityMeta(listing.viewQuality);
  const QualityIcon = quality.icon;

  const isSold = listing.status === "sold";
  const isUnavailable = isSold || (isInCart && !isSelected);

  return (
    <li>
      <button
        type="button"
        disabled={isUnavailable}
        onClick={() => onToggle(listing)}
        aria-pressed={isSelected}
        aria-label={`Row ${listing.rowLabel} seat ${listing.seatNumber}, ${quality.label}, ${formatMoney(
          listing.priceCents,
          currency,
        )}${isSold ? ", sold" : isInCart ? ", in another cart" : ""}`}
        className={cn(
          "group flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3 text-left",
          "transition-all duration-200",
          !isUnavailable &&
            "hover:-translate-y-px hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          isSelected && "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/50",
          isUnavailable && "cursor-not-allowed opacity-55 saturate-[0.35]",
        )}
      >
        {/* Seat identity ------------------------------------------------ */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[11px] font-bold text-foreground">
            {listing.sectionCode}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Row {listing.rowLabel} · Seat {listing.seatNumber}
            </p>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="size-3" />
              {listing.sectionName}
              {listing.isAisle && <span className="ml-1">· Aisle</span>}
            </p>
          </div>
        </div>

        {/* View quality ------------------------------------------------- */}
        <div className="min-w-0 flex-1">
          <span
            title={quality.description}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold [&_svg]:size-3",
              quality.badgeClass,
            )}
          >
            <QualityIcon />
            {quality.short}
          </span>
          {listing.viewNote && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground" title={listing.viewNote}>
              {listing.viewNote}
            </p>
          )}
        </div>

        {/* Price -------------------------------------------------------- */}
        <div className="ml-auto text-right">
          <p className="text-sm font-bold tabular-nums">{formatMoney(listing.priceCents, currency)}</p>
          {listing.discountPercent > 0 && listing.originalPriceCents && (
            <p className="flex items-center justify-end gap-1.5 text-[11px]">
              <span className="text-muted-foreground line-through tabular-nums">
                {formatMoney(listing.originalPriceCents, currency, { compact: true })}
              </span>
              <span className="rounded-full bg-emerald-500/10 px-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                -{listing.discountPercent}%
              </span>
            </p>
          )}
        </div>

        {/* State / select ----------------------------------------------- */}
        <div className="flex w-[6.5rem] shrink-0 items-center justify-end gap-2">
          {isSold && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Sold
            </span>
          )}
          {!isSold && isInCart && !isSelected && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Clock className="size-3" />
              In a cart
            </span>
          )}
          {!isUnavailable && (
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-transparent group-hover:border-primary/50",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
