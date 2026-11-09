import type { Metadata } from "next";
import { MatchCard } from "@/features/ticketmaster/components/match-card";
import { listStoredMatches } from "@/lib/ticketmaster/catalog";

export const metadata: Metadata = {
  title: "Discover sports events",
  description: "Browse sports events from Ticketmaster Discovery.",
};

export const dynamic = "force-dynamic";

export default async function TicketmasterEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; country?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 120);
  const city = params.city?.trim().slice(0, 100);
  const country = params.country?.trim().slice(0, 3);
  const page = Math.max(0, Math.min(9, Number.parseInt(params.page ?? "0", 10) || 0));

  let result: Awaited<ReturnType<typeof listStoredMatches>> | null = null;
  let error: string | null = null;
  try {
    result = await listStoredMatches({
      q,
      city,
      country,
      page,
      size: 20,
      sort: "date,asc",
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "The event catalog is unavailable.";
    console.error("[ticketmaster-page] catalog query failed", cause);
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ticketmaster Discovery</p>
        <h1 className="text-2xl font-bold tracking-tight">Explore sports events</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Events, venues, sale windows, and price ranges are synced from Ticketmaster. Public Discovery
          access does not include live seat inventory or in-app purchases.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium sm:col-span-2">
          Event or team
          <input name="q" defaultValue={q} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          City
          <input name="city" defaultValue={city} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium">
            Country
            <input name="country" defaultValue={country} maxLength={3} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Search
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Event data is unavailable. Check the database connection and Ticketmaster sync configuration.
        </p>
      ) : result?.items.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            {result.page.totalElements} synced events · page {result.page.number + 1} of {Math.max(result.page.totalPages, 1)}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((match) => <MatchCard key={match.id} match={match} />)}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <h2 className="font-semibold">No synced events found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An administrator must configure a Ticketmaster API key and market IDs, then run a catalog sync.
          </p>
        </div>
      )}
    </main>
  );
}
