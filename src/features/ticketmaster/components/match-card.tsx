import Link from "next/link";

type MatchCardProps = {
  match: {
    id: string;
    name: string;
    startUtc: string | null;
    localDate: string | null;
    localTime: string | null;
    status: string | null;
    venue: { id: string | null; name: string | null; city: string | null; timezone: string | null } | null;
    priceRange: { min: number | null; max: number | null; currency: string | null };
    availability: { status: string; source: string };
  };
};

function priceLabel(match: MatchCardProps["match"]) {
  const { min, max, currency } = match.priceRange;
  if (min === null || !currency || !/^[A-Z]{3}$/.test(currency)) return "Price not listed";
  try {
    const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
    const low = formatter.format(min);
    return max === null ? `From ${low}` : `${low} – ${formatter.format(max)}`;
  } catch {
    return "Price not listed";
  }
}

export function MatchCard({ match }: MatchCardProps) {
  const date = match.startUtc
    ? new Date(match.startUtc).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : [match.localDate, match.localTime].filter(Boolean).join(" ");

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {match.status ?? "Status not listed"}
        </p>
        <h2 className="mt-2 text-base font-bold leading-snug">{match.name}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {[date, match.venue?.name, match.venue?.city].filter(Boolean).join(" · ") || "Date and venue to be announced"}
        </p>
        <p className="mt-3 text-sm font-semibold">{priceLabel(match)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Ticketmaster Discovery listing; price and availability are indicative.
        </p>
      </div>
      <Link
        href={`/ticketmaster/${encodeURIComponent(match.id)}`}
        className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Event details
      </Link>
    </article>
  );
}
