"use client";

import { CheckCircle2, Loader2, RefreshCw, Signal, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { availabilityTone, viewQualityMeta } from "@/features/events/view-quality";
import type { CurrencyCode, SectionAvailability, SectionSummary } from "@/features/events/types";
import { selectSelectedSeats, useHoldStore } from "@/stores/hold-selection-store";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { StadiumMap } from "./stadium-map";

type SortMode = "price_asc" | "best_value" | "largest";

const SORT_LABELS: Record<SortMode, string> = {
  price_asc: "Cheapest",
  best_value: "Best value",
  largest: "Most seats",
};

export type SectionPickerProps = {
  currency: CurrencyCode;
  sections: SectionSummary[];
  availabilityBySection: Map<string, SectionAvailability>;
  isRefreshing: boolean;
  isStale: boolean;
  lastUpdatedLabel: string;
  onRefresh: () => void;
};

/**
 * The stadium view. Purely a consumer of availability data - the polling loop
 * lives one level up in `EventMarketplaceView` so the map, the cards and the
 * ticket feed all read from a single snapshot.
 */
export function SectionPicker({
  currency,
  sections,
  availabilityBySection,
  isRefreshing,
  isStale,
  lastUpdatedLabel,
  onRefresh,
}: SectionPickerProps) {
  const activeSectionId = useHoldStore((state) => state.activeSectionId);
  const activateSection = useHoldStore((state) => state.activateSection);
  const selectedSeats = useHoldStore(selectSelectedSeats);

  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("price_asc");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [clearViewOnly, setClearViewOnly] = useState(false);

  const selectedCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seat of selectedSeats) {
      counts.set(seat.sectionId, (counts.get(seat.sectionId) ?? 0) + 1);
    }
    return counts;
  }, [selectedSeats]);

  const visibleSections = useMemo(() => {
    const filtered = sections.filter((section) => {
      const availability = availabilityBySection.get(section.id);
      if (!availability) return true;
      if (availableOnly && availability.soldOut) return false;
      if (
        clearViewOnly &&
        (availability.bestViewQuality === "restricted" || availability.bestViewQuality === "obstructed")
      ) {
        return false;
      }
      return true;
    });

    const priceOf = (section: SectionSummary) =>
      availabilityBySection.get(section.id)?.minPriceCents ?? Number.MAX_SAFE_INTEGER;
    const discountOf = (section: SectionSummary) =>
      availabilityBySection.get(section.id)?.discountPercent ?? 0;
    const availableOf = (section: SectionSummary) =>
      availabilityBySection.get(section.id)?.available ?? 0;

    return [...filtered].sort((a, b) => {
      if (sort === "largest") return availableOf(b) - availableOf(a);
      if (sort === "best_value") return discountOf(b) - discountOf(a) || priceOf(a) - priceOf(b);
      return priceOf(a) - priceOf(b);
    });
  }, [sections, availabilityBySection, sort, availableOnly, clearViewOnly]);

  const hoveredSection = hoveredSectionId
    ? sections.find((section) => section.id === hoveredSectionId) ?? null
    : null;

  const totalAvailable = useMemo(
    () =>
      sections.reduce((sum, section) => sum + (availabilityBySection.get(section.id)?.available ?? 0), 0),
    [sections, availabilityBySection],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      {/* ---------------- Stadium map ---------------- */}
      <section className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Pick your section</h2>
              <p className="text-xs text-muted-foreground">{totalAvailable} seats on sale</p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {isRefreshing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {lastUpdatedLabel}
            </button>
          </div>

          <StadiumMap
            sections={sections}
            availabilityBySection={availabilityBySection}
            currency={currency}
            activeSectionId={activeSectionId}
            hoveredSectionId={hoveredSectionId}
            onActivate={activateSection}
            onHover={setHoveredSectionId}
          />

          <div
            className={cn(
              "mt-4 rounded-xl border border-border bg-muted/40 p-3 transition-opacity",
              hoveredSection ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            {hoveredSection ? (
              <HoveredSectionPreview
                section={hoveredSection}
                availability={availabilityBySection.get(hoveredSection.id)}
                currency={currency}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Hover a section for details.</p>
            )}
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Signal className={cn("size-3", isStale ? "text-destructive" : "text-emerald-500")} />
            {isStale ? "Live updates interrupted - retrying" : "Availability updates every 12s"}
          </p>
        </div>
      </section>

      {/* ---------------- Cards ---------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />
              Sort
            </span>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSort(mode)}
                aria-pressed={sort === mode}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
                  sort === mode
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {SORT_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={availableOnly} onClick={() => setAvailableOnly((v) => !v)}>
              <CheckCircle2 className="size-3" />
              Available only
            </FilterChip>
            <FilterChip active={clearViewOnly} onClick={() => setClearViewOnly((v) => !v)}>
              Clear view
            </FilterChip>
          </div>
        </div>

        {visibleSections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-semibold">No sections match those filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try clearing the filters, or pick another section on the map.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                availability={
                  availabilityBySection.get(section.id) ?? fallbackAvailability(section)
                }
                currency={currency}
                selectedSeatCount={selectedCountBySection.get(section.id) ?? 0}
                isActive={activeSectionId === section.id}
                onActivate={activateSection}
                onHover={setHoveredSectionId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all [&_svg]:size-3",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function HoveredSectionPreview({
  section,
  availability,
  currency,
}: {
  section: SectionSummary;
  availability?: SectionAvailability;
  currency: CurrencyCode;
}) {
  const tone = availabilityTone(availability?.available ?? 0, availability?.total ?? 0);
  const quality = viewQualityMeta(availability?.bestViewQuality ?? section.bestViewQuality);
  const QualityIcon = quality.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          <span className="font-mono">{section.code}</span> · {section.name}
        </p>
        <Badge variant={tone.soldOut ? "muted" : tone.urgent ? "warning" : "success"}>
          {tone.label}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold [&_svg]:size-3", quality.badgeClass)}>
          <QualityIcon />
          {quality.short}
        </span>
        {availability?.minPriceCents != null && (
          <span className="font-semibold tabular-nums">
            from {formatMoney(availability.minPriceCents, currency, { compact: true })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Only reached for a section that exists in the freshly fetched payload but
 * not in the server-rendered snapshot (a section added by an admin mid-session).
 * Rendering a conservative "nothing available" beats crashing the grid.
 */
function fallbackAvailability(section: SectionSummary): SectionAvailability {
  return {
    sectionId: section.id,
    total: section.listedCount,
    available: section.listedCount,
    held: 0,
    sold: section.soldCount,
    minPriceCents: section.minPriceCents,
    originalMinPriceCents: section.originalMinPriceCents,
    discountPercent: section.discountPercent,
    bestViewQuality: section.bestViewQuality,
    hasRestrictedView: section.hasRestrictedView,
    soldOut: section.listedCount === 0,
  };
}
