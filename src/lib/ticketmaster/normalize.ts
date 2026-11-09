export type JsonObject = Record<string, unknown>;

const TICKETMASTER_DOMAINS = [
  "ticketmaster.com", "ticketmaster.ca", "ticketmaster.co.uk", "ticketmaster.ie",
  "ticketmaster.com.au", "ticketmaster.co.nz", "ticketmaster.com.mx", "ticketmaster.com.br",
  "ticketmaster.es", "ticketmaster.fr", "ticketmaster.de", "ticketmaster.nl", "ticketmaster.be",
  "ticketmaster.at", "ticketmaster.ch", "ticketmaster.it", "ticketmaster.se", "ticketmaster.no",
  "ticketmaster.dk", "ticketmaster.fi", "ticketmaster.pl", "ticketmaster.cz", "ticketmaster.sk",
  "ticketmaster.gr", "ticketmaster.co.jp",
];

export function isTrustedTicketmasterUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      TICKETMASTER_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function isoDate(value: unknown): Date | null {
  const candidate = text(value);
  if (!candidate) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eventVenue(raw: JsonObject): JsonObject | null {
  const embedded = asObject(raw._embedded);
  return asObject(asArray(embedded?.venues)[0]);
}

export function eventAttractions(raw: JsonObject): JsonObject[] {
  const embedded = asObject(raw._embedded);
  return asArray(embedded?.attractions).map(asObject).filter((item): item is JsonObject => item !== null);
}

export function eventClassification(raw: JsonObject) {
  const classifications = asArray(raw.classifications).map(asObject).filter((item): item is JsonObject => item !== null);
  const sports = classifications.find((item) => {
    const segment = asObject(item.segment);
    return text(segment?.name)?.toLowerCase() === "sports";
  }) ?? classifications[0];
  if (!sports) return { sport: null, league: null };
  const genre = asObject(sports.genre);
  const subGenre = asObject(sports.subGenre);
  return {
    sport: text(genre?.name) ?? text(asObject(sports.segment)?.name),
    league: text(subGenre?.name),
  };
}

export function eventPriceRange(raw: JsonObject) {
  const price = asObject(asArray(raw.priceRanges)[0]);
  return {
    min: numberValue(price?.min),
    max: numberValue(price?.max),
    currency: text(price?.currency),
  };
}

export function normalizeDiscoveryEvent(raw: JsonObject) {
  const dates = asObject(raw.dates);
  const start = asObject(dates?.start);
  const sales = asObject(raw.sales);
  const publicSales = asObject(sales?.public);
  const seatmap = asObject(raw.seatmap);
  const venue = eventVenue(raw);
  const location = asObject(venue?.location);
  const city = asObject(venue?.city);
  const state = asObject(venue?.state);
  const country = asObject(venue?.country);
  const classification = eventClassification(raw);
  const priceRange = eventPriceRange(raw);
  const status = asObject(dates?.status);

  return {
    id: text(raw.id),
    name: text(raw.name),
    venue: venue ? {
      id: text(venue.id),
      name: text(venue.name),
      city: text(city?.name),
      stateCode: text(state?.stateCode),
      countryCode: text(country?.countryCode),
      timezone: text(venue.timezone),
      latitude: numberValue(location?.latitude),
      longitude: numberValue(location?.longitude),
      currency: priceRange.currency,
      seatmapUrl: text(asObject(venue.seatmap)?.staticUrl),
      raw: venue,
    } : null,
    teams: eventAttractions(raw).map((attraction) => ({
      id: text(attraction.id),
      name: text(attraction.name),
      sport: classification.sport,
      league: classification.league,
      images: asArray(attraction.images),
      raw: attraction,
      role: null,
    })).filter((team) => team.id && team.name),
    startUtc: isoDate(start?.dateTime),
    localDate: text(start?.localDate),
    localTime: text(start?.localTime),
    saleStatus: text(status?.code),
    onsaleStart: isoDate(publicSales?.startDateTime),
    onsaleEnd: isoDate(publicSales?.endDateTime),
    ...priceRange,
    ...classification,
    buyUrl: text(raw.url),
    seatmapStatic: text(seatmap?.staticUrl),
    raw,
  };
}

export function mapAvailabilityStatus(
  saleStatus: string | null,
  onsaleStart: Date | null,
  onsaleEnd: Date | null,
  now = new Date(),
): "available" | "sold_out" | "unknown" {
  void saleStatus;
  void onsaleStart;
  void onsaleEnd;
  void now;
  return "unknown";
}
