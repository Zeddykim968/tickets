/**
 * Dates are formatted against an explicit time zone so the server-rendered
 * markup and the browser agree. Formatting with the *server's* local zone is a
 * classic source of hydration mismatches and "kick-off moved by an hour" bugs
 * for anyone browsing from another region.
 *
 * The default venue zone is Lagos because the starter ships with NGN pricing;
 * derive it from `events.venue_country` when you add more markets.
 */
export const DEFAULT_VENUE_TIME_ZONE = "Africa/Lagos";

type DateInput = string | number | Date;

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

/** "Sat 14 Mar, 16:00" */
export function formatEventDateTime(value: DateInput, timeZone = DEFAULT_VENUE_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(toDate(value));
}

/** Splits a kick-off into scannable parts for dense cards. */
export function eventDateParts(value: DateInput, timeZone = DEFAULT_VENUE_TIME_ZONE) {
  const date = toDate(value);

  return {
    day: new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone }).format(date),
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone }).format(date).toUpperCase(),
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(date),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date),
    /** ISO string the client can use for a live countdown. */
    iso: date.toISOString(),
  };
}

/** "in 3 days" / "tomorrow" / "today" - coarse on purpose, for badges. */
export function relativeDayLabel(value: DateInput, now: DateInput = Date.now()) {
  const target = toDate(value);
  const reference = toDate(now);
  const days = Math.round(
    (startOfDay(target).getTime() - startOfDay(reference).getTime()) / 86_400_000,
  );

  if (days < 0) return "finished";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "next week";
  return `in ${Math.round(days / 7)} weeks`;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
