import Link from "next/link";

/**
 * Shared chrome for the marketplace: a horizontal filter rail above every
 * page in the section. The links are display-only for now (the index page does
 * not yet read `sort` / `competition` from the URL) - they establish the
 * navigation pattern and the URL contract those filters will use.
 */
const MARKET_FILTERS = [
  { href: "/marketplace", label: "All events" },
  { href: "/marketplace?sort=soonest", label: "Soonest" },
  { href: "/marketplace?sort=cheapest", label: "Cheapest entry" },
  { href: "/marketplace?competition=Champions League", label: "Champions League" },
  { href: "/marketplace?competition=Premier League", label: "Premier League" },
  { href: "/marketplace?competition=NPFL", label: "NPFL" },
];

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <nav
        aria-label="Marketplace filters"
        className="mb-8 flex gap-1.5 overflow-x-auto border-b border-border pb-3 [scrollbar-width:none]"
      >
        {MARKET_FILTERS.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
