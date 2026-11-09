import "server-only";
import { getRedis } from "@/features/holds/redis";
import { getDb, ticketmasterSports } from "@/db";
import { requestDiscovery, ticketmasterDailyUsage } from "@/lib/ticketmaster/client";
import { asArray, asObject, text } from "@/lib/ticketmaster/normalize";
import { ticketmasterMarkets } from "@/lib/ticketmaster/config";
import { upsertDiscoveryEvent } from "@/lib/ticketmaster/catalog";

const PAGE_SIZE = 100;
const MAX_PAGES_PER_WINDOW = 10;
const MAX_SYNC_DAYS = 31;
const WINDOW_DAYS = 7;

function dateWindows(from: Date, to: Date) {
  const windows: Array<{ start: Date; end: Date }> = [];
  let start = new Date(from);
  while (start < to) {
    const end = new Date(Math.min(
      start.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000,
      to.getTime(),
    ));
    windows.push({ start, end });
    start = end;
  }
  return windows;
}

function embeddedEvents(response: unknown) {
  const root = asObject(response);
  return asArray(asObject(root?._embedded)?.events)
    .map(asObject)
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

function embeddedClassifications(response: unknown) {
  const root = asObject(response);
  return asArray(asObject(root?._embedded)?.classifications)
    .map(asObject)
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function syncSportsTaxonomy() {
  const response = await requestDiscovery("/classifications.json", { segmentName: "Sports" }, { backgroundSync: true });
  const db = getDb();

  for (const segment of embeddedClassifications(response)) {
    const segmentId = text(segment.id);
    if (!segmentId || !text(segment.name)) continue;
    await db.insert(ticketmasterSports).values({
      id: segmentId,
      name: text(segment.name) ?? "Sports",
      level: "segment",
      parentId: null,
      raw: segment,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: ticketmasterSports.id,
      set: { name: text(segment.name) ?? "Sports", level: "segment", parentId: null, raw: segment, syncedAt: new Date() },
    });

    const embedded = asObject(segment._embedded);
    for (const genre of asArray(embedded?.genres).map(asObject).filter((item): item is NonNullable<typeof item> => item !== null)) {
      const genreId = text(genre.id);
      if (!genreId || !text(genre.name)) continue;
      await db.insert(ticketmasterSports).values({
        id: genreId,
        name: text(genre.name) ?? "",
        level: "genre",
        parentId: segmentId,
        raw: genre,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: ticketmasterSports.id,
        set: { name: text(genre.name) ?? "", level: "genre", parentId: segmentId, raw: genre, syncedAt: new Date() },
      });

      const genreEmbedded = asObject(genre._embedded);
      for (const subGenre of asArray(genreEmbedded?.subGenres).map(asObject).filter((item): item is NonNullable<typeof item> => item !== null)) {
        const subGenreId = text(subGenre.id);
        if (!subGenreId || !text(subGenre.name)) continue;
        await db.insert(ticketmasterSports).values({
          id: subGenreId,
          name: text(subGenre.name) ?? "",
          level: "subGenre",
          parentId: genreId,
          raw: subGenre,
          syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: ticketmasterSports.id,
          set: { name: text(subGenre.name) ?? "", level: "subGenre", parentId: genreId, raw: subGenre, syncedAt: new Date() },
        });
      }
    }
  }
}

export async function syncTicketmasterMatches(input: {
  from: Date;
  to: Date;
  markets?: string[];
}) {
  if (input.to <= input.from) throw new Error("Sync end date must be after its start date.");
  if (input.to.getTime() - input.from.getTime() > MAX_SYNC_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`Ticketmaster sync windows are limited to ${MAX_SYNC_DAYS} days per run.`);
  }

  const markets = input.markets?.length ? input.markets : ticketmasterMarkets();
  if (markets.length === 0) {
    throw new Error("Set TICKETMASTER_MARKET_IDS to one or more Ticketmaster market IDs before syncing.");
  }
  const normalizedMarkets = [...new Set(markets.map((market) => market.trim()).filter(Boolean))];
  if (normalizedMarkets.length > 10 || normalizedMarkets.some((market) => !/^[A-Za-z0-9_-]{1,40}$/.test(market))) {
    throw new Error("Provide no more than 10 valid Ticketmaster market IDs.");
  }

  let eventsProcessed = 0;
  let pagesFetched = 0;

  for (const marketId of normalizedMarkets) {
    for (const window of dateWindows(input.from, input.to)) {
      for (let page = 0; page < MAX_PAGES_PER_WINDOW; page += 1) {
        const response = await requestDiscovery("/events.json", {
          segmentName: "Sports",
          includeTest: "no",
          marketId,
          startDateTime: window.start.toISOString(),
          endDateTime: window.end.toISOString(),
          size: PAGE_SIZE,
          page,
          sort: "date,asc",
        }, { backgroundSync: true });
        pagesFetched += 1;

        const events = embeddedEvents(response);
        for (const event of events) {
          await upsertDiscoveryEvent(event);
          eventsProcessed += 1;
        }

        const pageInfo = asObject(asObject(response)?.page);
        const totalPages = Number(pageInfo?.totalPages ?? 0);
        if (events.length === 0 || (Number.isFinite(totalPages) && totalPages > 0 && page + 1 >= totalPages)) {
          break;
        }
      }
    }
  }

  await syncSportsTaxonomy();
  const completedAt = new Date().toISOString();
  await getRedis().set("ticketmaster:discovery:last-sync", JSON.stringify({
    completedAt,
    markets: normalizedMarkets,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    eventsProcessed,
    pagesFetched,
  }));

  return {
    completedAt,
    markets: normalizedMarkets,
    eventsProcessed,
    pagesFetched,
    dailyCallsUsed: await ticketmasterDailyUsage(),
  };
}

export async function lastTicketmasterSync() {
  const value = await getRedis().get("ticketmaster:discovery:last-sync");
  if (!value) return null;
  try {
    return JSON.parse(value) as {
      completedAt: string;
      markets: string[];
      from: string;
      to: string;
      eventsProcessed: number;
      pagesFetched: number;
    };
  } catch (error) {
    console.error("[ticketmaster] invalid last sync state", error);
    return null;
  }
}
