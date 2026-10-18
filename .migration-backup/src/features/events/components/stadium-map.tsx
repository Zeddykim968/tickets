"use client";

import type { CurrencyCode, SectionAvailability, SectionSummary } from "@/features/events/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type StadiumMapProps = {
  sections: SectionSummary[];
  availabilityBySection: Map<string, SectionAvailability>;
  currency: CurrencyCode;
  activeSectionId: string | null;
  hoveredSectionId: string | null;
  onActivate: (sectionId: string) => void;
  onHover: (sectionId: string | null) => void;
};

/**
 * Section geometry comes from the database as container percentages
 * (`map_x`, `map_y`, ...), so this component holds no layout knowledge - a new
 * stadium is a data change, not a code change.
 *
 * The coordinate space is a fixed 100x64 viewBox; the browser scales it. All
 * font sizes below are therefore in *user units*, not pixels.
 */
export function StadiumMap({
  sections,
  availabilityBySection,
  currency,
  activeSectionId,
  hoveredSectionId,
  onActivate,
  onHover,
}: StadiumMapProps) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 64"
        className="w-full select-none"
        role="group"
        aria-label="Stadium section map"
        onMouseLeave={() => onHover(null)}
      >
        {/* The bowl ---------------------------------------------------- */}
        <rect x="0.5" y="0.5" width="99" height="63" rx="7" className="fill-muted/40 stroke-border" strokeWidth="0.4" />

        {/* The pitch -------------------------------------------------- */}
        <g className="pointer-events-none">
          <rect
            x="31"
            y="18"
            width="38"
            height="28"
            rx="1.2"
            className="fill-emerald-500/10 stroke-emerald-600/35"
            strokeWidth="0.4"
          />
          <line x1="50" y1="18" x2="50" y2="46" className="stroke-emerald-600/35" strokeWidth="0.35" />
          <circle cx="50" cy="32" r="5" className="fill-none stroke-emerald-600/35" strokeWidth="0.35" />
          <circle cx="50" cy="32" r="0.7" className="fill-emerald-600/40" />
          {/* Penalty boxes */}
          <rect x="31" y="25.5" width="5" height="13" className="fill-none stroke-emerald-600/30" strokeWidth="0.35" />
          <rect x="64" y="25.5" width="5" height="13" className="fill-none stroke-emerald-600/30" strokeWidth="0.35" />
          {/* Goal mouths */}
          <rect x="29.8" y="29" width="1.2" height="6" className="fill-foreground/20" />
          <rect x="69" y="29" width="1.2" height="6" className="fill-foreground/20" />
        </g>

        {/* Sections --------------------------------------------------- */}
        {sections.map((section) => {
          const availability = availabilityBySection.get(section.id);
          const isActive = activeSectionId === section.id;
          const isHovered = hoveredSectionId === section.id;
          const available = availability?.available ?? section.listedCount;
          const soldOut = availability?.soldOut ?? available === 0;

          const priceLabel =
            availability?.minPriceCents != null
              ? `from ${formatMoney(availability.minPriceCents, currency, { compact: true })}`
              : "no listings";

          return (
            <g
              key={section.id}
              onClick={() => onActivate(section.id)}
              onMouseEnter={() => onHover(section.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${section.name}: ${available} seats available, ${priceLabel}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onActivate(section.id);
                }
              }}
            >
              <title>{`${section.code} · ${section.name} — ${available} available, ${priceLabel}`}</title>
              <rect
                x={section.map.x - section.map.width / 2}
                y={section.map.y - section.map.height / 2}
                width={section.map.width}
                height={section.map.height}
                rx="1.4"
                strokeWidth={isActive || isHovered ? "0.7" : "0.35"}
                transform={
                  section.map.rotation
                    ? `rotate(${section.map.rotation} ${section.map.x} ${section.map.y})`
                    : undefined
                }
                className={cn(
                  "transition-all duration-200",
                  fillForSection({ isActive, isHovered, soldOut, available }),
                )}
              />
              <text
                x={section.map.x}
                y={section.map.y + 0.9}
                textAnchor="middle"
                fontSize="2.6"
                className={cn(
                  "pointer-events-none font-bold transition-colors",
                  isActive || isHovered ? "fill-primary-foreground" : "fill-foreground/70",
                )}
              >
                {section.code}
              </text>
            </g>
          );
        })}
      </svg>

      <MapLegend />
    </div>
  );
}

function fillForSection({
  isActive,
  isHovered,
  soldOut,
  available,
}: {
  isActive: boolean;
  isHovered: boolean;
  soldOut: boolean;
  available: number;
}) {
  if (isActive) return "fill-primary stroke-primary-foreground/60";
  if (soldOut) return "fill-muted stroke-border";
  // Hover lifts the tone one step so the cursor reads as "target".
  if (available <= 5) return isHovered ? "fill-amber-500 stroke-amber-600" : "fill-amber-500/70 stroke-amber-600/50";
  if (available <= 20) return isHovered ? "fill-emerald-500/90 stroke-emerald-600" : "fill-emerald-500/50 stroke-emerald-600/40";
  return isHovered ? "fill-emerald-600 stroke-emerald-700" : "fill-emerald-500/80 stroke-emerald-600/50";
}

function MapLegend() {
  const items = [
    { className: "bg-emerald-500/80", label: "Good availability" },
    { className: "bg-amber-500/80", label: "Nearly gone" },
    { className: "bg-primary", label: "Selected" },
    { className: "bg-muted-foreground/25", label: "Sold out" },
  ];

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", item.className)} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
