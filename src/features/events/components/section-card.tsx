"use client";

import { Check, Flame, Tag, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { availabilityTone, viewQualityMeta } from "@/features/events/view-quality";
import type { CurrencyCode, SectionAvailability, SectionSummary } from "@/features/events/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SectionCardProps = {
  section: SectionSummary;
  availability: SectionAvailability;
  currency: CurrencyCode;
  /** How many seats the buyer has already picked inside this section. */
  selectedSeatCount: number;
  isActive: boolean;
  onActivate: (sectionId: string) => void;
  onHover?: (sectionId: string | null) => void;
};

const TIER_LABEL: Record<SectionSummary["tier"], string> = {
  vip: "VIP",
  premium: "Premium",
  standard: "Standard",
  accessible: "Accessible",
};

/**
 * A section card: the buyer's primary decision surface.
 *
 * Everything visible here is render-ready data - the discount percentage, the
 * "from" price and the availability counts were all computed server-side, so
 * the card contains no money maths of its own.
 */
export function SectionCard({
  section,
  availability,
  currency,
  selectedSeatCount,
  isActive,
  onActivate,
  onHover,
}: SectionCardProps) {
  const tone = availabilityTone(availability.available, availability.total);
  const quality = viewQualityMeta(availability.bestViewQuality);
  const QualityIcon = quality.icon;

  const hasPrice = availability.minPriceCents !== null;
  const discount = availability.discountPercent;
  const soldOut = availability.soldOut;
  const filledRatio =
    availability.total > 0 ? Math.round((availability.available / availability.total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onActivate(section.id)}
      onMouseEnter={() => onHover?.(section.id)}
      onMouseLeave={() => onHover?.(null)}
      aria-pressed={isActive}
      aria-label={`${section.name}, ${SECTION_LABEL(section)}, ${availability.available} seats available`}
      className={cn(
        "group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left",
        "transition-all duration-200 outline-none",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive && "border-primary/60 ring-2 ring-primary/60 shadow-lg shadow-primary/10",
        soldOut && "opacity-60 saturate-[0.35] hover:opacity-90 hover:saturate-100",
      )}
    >
      {/* Scarcity accent: a hairline of colour down the leading edge. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1 transition-colors",
          soldOut ? "bg-muted-foreground/25" : tone.barClass,
        )}
      />

      <div className="flex items-start justify-between gap-3 pl-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-tight text-foreground">
              {section.code}
            </span>
            <Badge variant="outline">{TIER_LABEL[section.tier]}</Badge>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold text-foreground" title={section.name}>
            {section.name}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {selectedSeatCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-sm">
              <Check className="size-3" strokeWidth={3} />
              {selectedSeatCount}
            </span>
          )}
          {isActive && selectedSeatCount === 0 && (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Check className="size-3" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>

      {/* Price tag ------------------------------------------------------- */}
      <div className="flex items-end justify-between gap-3 pl-1.5">
        <div>
          {hasPrice ? (
            <>
              <p className="flex items-baseline gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">from</span>
                <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                  {formatMoney(availability.minPriceCents as number, currency, { compact: true })}
                </span>
              </p>
              {discount > 0 && availability.originalMinPriceCents && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground line-through tabular-nums">
                    {formatMoney(availability.originalMinPriceCents, currency, { compact: true })}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    save {discount}%
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">No listings yet</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold [&_svg]:size-3",
              tone.badgeClass,
            )}
          >
            <span className="relative flex size-1.5">
              {tone.urgent && (
                <span
                  aria-hidden
                  className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", tone.dotClass)}
                />
              )}
              <span className={cn("relative inline-flex size-1.5 rounded-full", tone.dotClass)} />
            </span>
            {tone.label}
          </span>

          {discount >= 20 && !soldOut && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-foreground">
              <Flame className="size-3" />
              Hot deal
            </span>
          )}
        </div>
      </div>

      {/* Quality + inventory --------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-1.5 pl-1.5">
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

        {section.hasRestrictedView && availability.bestViewQuality === "clear" && (
          <Badge variant="outline">Some restricted seats</Badge>
        )}

        {!hasPrice && (
          <Badge variant="muted">
            <Tag />
            Delisted
          </Badge>
        )}
      </div>

      {/* Availability bar ------------------------------------------------ */}
      <div className="space-y-1 pl-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone.barClass)}
            style={{ width: `${filledRatio}%` }}
          />
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="size-3" />
          {availability.total} listed
          {availability.held > 0 && <span className="text-amber-600 dark:text-amber-400">· {availability.held} in carts</span>}
          {availability.sold > 0 && <span>· {availability.sold} sold</span>}
        </p>
      </div>
    </button>
  );
}

function SECTION_LABEL(section: SectionSummary) {
  return `${TIER_LABEL[section.tier]} section`;
}
