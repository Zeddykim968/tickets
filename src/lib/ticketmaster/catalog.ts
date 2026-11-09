import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ticketmasterMatches,
  ticketmasterMatchTeams,
  ticketmasterSports,
  ticketmasterTeams,
  ticketmasterVenues,
} from "@/db/schema";
import {
  asObject,
  eventClassification,
  mapAvailabilityStatus,
  normalizeDiscoveryEvent,
  numberValue,
  type JsonObject,
  text,
} from "@/lib/ticketmaster/normalize";

export type MatchSearch = {
  q?: string;
  sport?: string;
  teamId?: string;
  venueId?: string;
  city?: string;
  state?: string;
  country?: string;
  from?: Date;
  to?: Date;
  onsale?: boolean;
  near?: { latitude: number; longitude: number; radiusKm: number };
  sort?: string;
  page: number;
  size: number;
};

function toMatchDto(row: {
  id: string;
  name: string;
  startUtc: Date | null;
  localDate: string | null;
  localTime: string | null;
  saleStatus: string | null;
  onsaleStart: Date | null;
  onsaleEnd: Date | null;
  priceMin: string | null;
  priceMax: string | null;
  currency: string | null;
  sport: string | null;
  league: string | null;
  buyUrl: string | null;
  seatmapStatic: string | null;
  syncedAt: Date;
  venue: {
    id: string | null;
    name: string | null;
    city: string | null;
    timezone: string | null;
  };
  teams: Array<{ id: string; name: string; role: string | null }>;
}) {
  return {
    id: row.id,
    name: row.name,
    startUtc: row.startUtc?.toISOString() ?? null,
    localDate: row.localDate,
    localTime: row.localTime,
    status: row.saleStatus,
    onsaleStart: row.onsaleStart?.toISOString() ?? null,
    onsaleEnd: row.onsaleEnd?.toISOString() ?? null,
    venue: row.venue.id ? row.venue : null,
    teams: row.teams,
    priceRange: {
      min: row.priceMin === null ? null : Number(row.priceMin),
      max: row.priceMax === null ? null : Number(row.priceMax),
      currency: row.currency,
    },
    sport: row.sport,
    league: row.league,
    availability: {
      status: mapAvailabilityStatus(row.saleStatus, row.onsaleStart, row.onsaleEnd),
      source: "catalog" as const,
    },
    seatmap: { staticImageUrl: row.seatmapStatic },
    purchase: { mode: "redirect" as const, url: row.buyUrl },
    syncedAt: row.syncedAt.toISOString(),
  };
}

async function attachTeams<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return [];
  const joins = await getDb()
    .select({
      matchId: ticketmasterMatchTeams.matchId,
      teamId: ticketmasterTeams.id,
      name: ticketmasterTeams.name,
      role: ticketmasterMatchTeams.role,
    })
    .from(ticketmasterMatchTeams)
    .innerJoin(ticketmasterTeams, eq(ticketmasterTeams.id, ticketmasterMatchTeams.teamId))
    .where(inArray(ticketmasterMatchTeams.matchId, rows.map((row) => row.id)));
  const teamsByMatch = new Map<string, Array<{ id: string; name: string; role: string | null }>>();
  for (const join of joins) {
    const list = teamsByMatch.get(join.matchId) ?? [];
    list.push({ id: join.teamId, name: join.name, role: join.role });
    teamsByMatch.set(join.matchId, list);
  }
  return rows.map((row) => ({ ...row, teams: teamsByMatch.get(row.id) ?? [] }));
}

export async function listStoredMatches(query: MatchSearch) {
  const db = getDb();
  const where: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q}%`;
    const teamMatchIds = db
      .select({ matchId: ticketmasterMatchTeams.matchId })
      .from(ticketmasterMatchTeams)
      .innerJoin(ticketmasterTeams, eq(ticketmasterTeams.id, ticketmasterMatchTeams.teamId))
      .where(ilike(ticketmasterTeams.name, pattern));
    const nameOrVenue = or(
      ilike(ticketmasterMatches.name, pattern),
      ilike(ticketmasterVenues.name, pattern),
      ilike(ticketmasterVenues.city, pattern),
      inArray(ticketmasterMatches.id, teamMatchIds),
    );
    if (nameOrVenue) where.push(nameOrVenue);
  }
  if (query.sport) where.push(ilike(ticketmasterMatches.sport, query.sport));
  if (query.teamId) {
    const teamMatchIds = db
      .select({ matchId: ticketmasterMatchTeams.matchId })
      .from(ticketmasterMatchTeams)
      .where(eq(ticketmasterMatchTeams.teamId, query.teamId));
    where.push(inArray(ticketmasterMatches.id, teamMatchIds));
  }
  if (query.venueId) where.push(eq(ticketmasterMatches.venueId, query.venueId));
  if (query.city) where.push(ilike(ticketmasterVenues.city, query.city));
  if (query.state) where.push(eq(ticketmasterVenues.stateCode, query.state.toUpperCase()));
  if (query.country) where.push(eq(ticketmasterVenues.countryCode, query.country.toUpperCase()));
  if (query.from) where.push(sql`${ticketmasterMatches.startUtc} >= ${query.from}`);
  if (query.to) where.push(sql`${ticketmasterMatches.startUtc} <= ${query.to}`);
  if (query.onsale) where.push(eq(ticketmasterMatches.saleStatus, "onsale"));
  if (query.near) {
    const { latitude, longitude, radiusKm } = query.near;
    const distance = sql`6371 * acos(least(1.0, greatest(-1.0,
      sin(radians(${ticketmasterVenues.latitude})) * sin(radians(${latitude})) +
      cos(radians(${latitude})) * cos(radians(${ticketmasterVenues.latitude})) *
      cos(radians(${ticketmasterVenues.longitude}) - radians(${longitude}))
    )))`;
    where.push(sql`${ticketmasterVenues.latitude} is not null and ${ticketmasterVenues.longitude} is not null and ${distance} <= ${radiusKm}`);
  }

  const condition = where.length ? and(...where) : undefined;
  const [totalRow] = await db
    .select({ total: count() })
    .from(ticketmasterMatches)
    .leftJoin(ticketmasterVenues, eq(ticketmasterVenues.id, ticketmasterMatches.venueId))
    .where(condition);

  const relevanceSort = query.sort === "relevance,desc" && query.q
    ? sql`case
        when lower(${ticketmasterMatches.name}) = lower(${query.q}) then 0
        when lower(${ticketmasterMatches.name}) like lower(${`${query.q}%`}) then 1
        else 2 end`
    : null;
  const distanceSort = query.sort === "distance,asc" && query.near
    ? sql`6371 * acos(least(1.0, greatest(-1.0,
        sin(radians(${ticketmasterVenues.latitude})) * sin(radians(${query.near.latitude})) +
        cos(radians(${query.near.latitude})) * cos(radians(${ticketmasterVenues.latitude})) *
        cos(radians(${ticketmasterVenues.longitude}) - radians(${query.near.longitude}))
      )))`
    : null;
  const orderBy = distanceSort
    ? [asc(distanceSort), asc(ticketmasterMatches.startUtc)]
    : relevanceSort
      ? [asc(relevanceSort), asc(ticketmasterMatches.startUtc)]
      : query.sort === "date,desc"
        ? [desc(ticketmasterMatches.startUtc)]
        : query.sort === "name,asc"
          ? [asc(ticketmasterMatches.name)]
          : [asc(ticketmasterMatches.startUtc)];

  const rawRows = await db
    .select({
      id: ticketmasterMatches.id,
      name: ticketmasterMatches.name,
      startUtc: ticketmasterMatches.startUtc,
      localDate: ticketmasterMatches.localDate,
      localTime: ticketmasterMatches.localTime,
      saleStatus: ticketmasterMatches.saleStatus,
      onsaleStart: ticketmasterMatches.onsaleStart,
      onsaleEnd: ticketmasterMatches.onsaleEnd,
      priceMin: ticketmasterMatches.priceMin,
      priceMax: ticketmasterMatches.priceMax,
      currency: ticketmasterMatches.currency,
      sport: ticketmasterMatches.sport,
      league: ticketmasterMatches.league,
      buyUrl: ticketmasterMatches.buyUrl,
      seatmapStatic: ticketmasterMatches.seatmapStatic,
      syncedAt: ticketmasterMatches.syncedAt,
      venueId: ticketmasterVenues.id,
      venueName: ticketmasterVenues.name,
      city: ticketmasterVenues.city,
      timezone: ticketmasterVenues.timezone,
    })
    .from(ticketmasterMatches)
    .leftJoin(ticketmasterVenues, eq(ticketmasterVenues.id, ticketmasterMatches.venueId))
    .where(condition)
    .orderBy(...orderBy)
    .limit(query.size)
    .offset(query.page * query.size);

  const withTeams = await attachTeams(rawRows);
  return {
    items: withTeams.map((row) => toMatchDto({
      ...row,
      venue: { id: row.venueId, name: row.venueName, city: row.city, timezone: row.timezone },
    })),
    page: {
      number: query.page,
      size: query.size,
      totalElements: totalRow?.total ?? 0,
      totalPages: Math.ceil((totalRow?.total ?? 0) / query.size),
    },
  };
}

export async function getStoredMatch(matchId: string) {
  const [row] = await getDb()
    .select({
      id: ticketmasterMatches.id,
      name: ticketmasterMatches.name,
      startUtc: ticketmasterMatches.startUtc,
      localDate: ticketmasterMatches.localDate,
      localTime: ticketmasterMatches.localTime,
      saleStatus: ticketmasterMatches.saleStatus,
      onsaleStart: ticketmasterMatches.onsaleStart,
      onsaleEnd: ticketmasterMatches.onsaleEnd,
      priceMin: ticketmasterMatches.priceMin,
      priceMax: ticketmasterMatches.priceMax,
      currency: ticketmasterMatches.currency,
      sport: ticketmasterMatches.sport,
      league: ticketmasterMatches.league,
      buyUrl: ticketmasterMatches.buyUrl,
      seatmapStatic: ticketmasterMatches.seatmapStatic,
      syncedAt: ticketmasterMatches.syncedAt,
      raw: ticketmasterMatches.raw,
      venueId: ticketmasterVenues.id,
      venueName: ticketmasterVenues.name,
      city: ticketmasterVenues.city,
      timezone: ticketmasterVenues.timezone,
      venueRaw: ticketmasterVenues.raw,
    })
    .from(ticketmasterMatches)
    .leftJoin(ticketmasterVenues, eq(ticketmasterVenues.id, ticketmasterMatches.venueId))
    .where(eq(ticketmasterMatches.id, matchId))
    .limit(1);
  if (!row) return null;
  const [withTeams] = await attachTeams([row]);
  return {
    ...toMatchDto({
      ...withTeams,
      venue: {
        id: row.venueId,
        name: row.venueName,
        city: row.city,
        timezone: row.timezone,
      },
    }),
    raw: row.raw,
    venueRaw: row.venueRaw,
  };
}

export async function upsertDiscoveryEvent(raw: JsonObject) {
  const normalized = normalizeDiscoveryEvent(raw);
  if (!normalized.id || !normalized.name) {
    throw new Error("Ticketmaster event response is missing its id or name.");
  }

  const db = getDb();
  if (normalized.venue?.id && normalized.venue.name) {
    await db.insert(ticketmasterVenues).values({
      id: normalized.venue.id,
      name: normalized.venue.name,
      city: normalized.venue.city,
      stateCode: normalized.venue.stateCode,
      countryCode: normalized.venue.countryCode,
      timezone: normalized.venue.timezone,
      latitude: normalized.venue.latitude,
      longitude: normalized.venue.longitude,
      currency: normalized.venue.currency,
      seatmapUrl: normalized.venue.seatmapUrl,
      details: {},
      raw: normalized.venue.raw,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: ticketmasterVenues.id,
      set: {
        name: normalized.venue.name,
        city: normalized.venue.city,
        stateCode: normalized.venue.stateCode,
        countryCode: normalized.venue.countryCode,
        timezone: normalized.venue.timezone,
        latitude: normalized.venue.latitude,
        longitude: normalized.venue.longitude,
        currency: normalized.venue.currency,
        seatmapUrl: normalized.venue.seatmapUrl,
        raw: normalized.venue.raw,
        syncedAt: new Date(),
      },
    });
  }

  for (const team of normalized.teams) {
    if (!team.id || !team.name) continue;
    await db.insert(ticketmasterTeams).values({
      id: team.id,
      name: team.name,
      sport: team.sport,
      league: team.league,
      images: team.images,
      raw: team.raw,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: ticketmasterTeams.id,
      set: {
        name: team.name,
        sport: team.sport,
        league: team.league,
        images: team.images,
        raw: team.raw,
        syncedAt: new Date(),
      },
    });
  }

  await db.insert(ticketmasterMatches).values({
    id: normalized.id,
    name: normalized.name,
    venueId: normalized.venue?.id,
    startUtc: normalized.startUtc,
    localDate: normalized.localDate,
    localTime: normalized.localTime,
    saleStatus: normalized.saleStatus,
    onsaleStart: normalized.onsaleStart,
    onsaleEnd: normalized.onsaleEnd,
    priceMin: normalized.min === null ? null : normalized.min.toFixed(2),
    priceMax: normalized.max === null ? null : normalized.max.toFixed(2),
    currency: normalized.currency,
    sport: normalized.sport,
    league: normalized.league,
    buyUrl: normalized.buyUrl,
    seatmapStatic: normalized.seatmapStatic,
    raw: normalized.raw,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: ticketmasterMatches.id,
    set: {
      name: normalized.name,
      venueId: normalized.venue?.id,
      startUtc: normalized.startUtc,
      localDate: normalized.localDate,
      localTime: normalized.localTime,
      saleStatus: normalized.saleStatus,
      onsaleStart: normalized.onsaleStart,
      onsaleEnd: normalized.onsaleEnd,
      priceMin: normalized.min === null ? null : normalized.min.toFixed(2),
      priceMax: normalized.max === null ? null : normalized.max.toFixed(2),
      currency: normalized.currency,
      sport: normalized.sport,
      league: normalized.league,
      buyUrl: normalized.buyUrl,
      seatmapStatic: normalized.seatmapStatic,
      raw: normalized.raw,
      syncedAt: new Date(),
    },
  });

  for (const team of normalized.teams) {
    if (!team.id || !team.name) continue;
    await db.insert(ticketmasterMatchTeams).values({
      matchId: normalized.id,
      teamId: team.id,
      role: team.role,
    }).onConflictDoUpdate({
      target: [ticketmasterMatchTeams.matchId, ticketmasterMatchTeams.teamId],
      set: { role: team.role },
    });
  }
}

export async function listStoredVenues(query: {
  q?: string;
  city?: string;
  country?: string;
  page: number;
  size: number;
}) {
  const where: SQL[] = [];
  if (query.q) where.push(ilike(ticketmasterVenues.name, `%${query.q}%`));
  if (query.city) where.push(ilike(ticketmasterVenues.city, query.city));
  if (query.country) where.push(eq(ticketmasterVenues.countryCode, query.country.toUpperCase()));
  const condition = where.length ? and(...where) : undefined;
  const db = getDb();
  const [total] = await db.select({ value: count() }).from(ticketmasterVenues).where(condition);
  const rows = await db
    .select({
      id: ticketmasterVenues.id,
      name: ticketmasterVenues.name,
      city: ticketmasterVenues.city,
      stateCode: ticketmasterVenues.stateCode,
      countryCode: ticketmasterVenues.countryCode,
      timezone: ticketmasterVenues.timezone,
      latitude: ticketmasterVenues.latitude,
      longitude: ticketmasterVenues.longitude,
      currency: ticketmasterVenues.currency,
      seatmapUrl: ticketmasterVenues.seatmapUrl,
      syncedAt: ticketmasterVenues.syncedAt,
    })
    .from(ticketmasterVenues)
    .where(condition)
    .orderBy(asc(ticketmasterVenues.name))
    .limit(query.size)
    .offset(query.page * query.size);
  return {
    items: rows,
    page: {
      number: query.page,
      size: query.size,
      totalElements: total?.value ?? 0,
      totalPages: Math.ceil((total?.value ?? 0) / query.size),
    },
  };
}

export async function getStoredVenue(id: string) {
  const [venue] = await getDb()
    .select()
    .from(ticketmasterVenues)
    .where(eq(ticketmasterVenues.id, id))
    .limit(1);
  if (!venue) return null;
  const [upcoming] = await getDb()
    .select({ value: count() })
    .from(ticketmasterMatches)
    .where(and(
      eq(ticketmasterMatches.venueId, id),
      sql`${ticketmasterMatches.startUtc} >= now()`,
    ));
  return { ...venue, upcomingMatches: upcoming?.value ?? 0 };
}

export async function upsertDiscoveryVenue(raw: JsonObject) {
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) throw new Error("Ticketmaster venue response is missing its id or name.");
  const city = asObject(raw.city);
  const state = asObject(raw.state);
  const country = asObject(raw.country);
  const location = asObject(raw.location);
  const seatmap = asObject(raw.seatmap);
  const now = new Date();
  const fields = {
    name,
    city: text(city?.name),
    stateCode: text(state?.stateCode),
    countryCode: text(country?.countryCode),
    timezone: text(raw.timezone),
    latitude: numberValue(location?.latitude),
    longitude: numberValue(location?.longitude),
    currency: text(raw.currency),
    seatmapUrl: text(seatmap?.staticUrl),
    details: {
      address: raw.address,
      boxOfficeInfo: raw.boxOfficeInfo,
      parkingDetail: raw.parkingDetail,
      accessibleSeatingDetail: raw.accessibleSeatingDetail,
      generalInfo: raw.generalInfo,
    },
    raw,
    syncedAt: now,
  };
  await getDb().insert(ticketmasterVenues).values({ id, ...fields }).onConflictDoUpdate({
    target: ticketmasterVenues.id,
    set: fields,
  });
}

export async function listStoredTeams(query: { q?: string; page: number; size: number }) {
  const condition = query.q ? ilike(ticketmasterTeams.name, `%${query.q}%`) : undefined;
  const db = getDb();
  const [total] = await db.select({ value: count() }).from(ticketmasterTeams).where(condition);
  const rows = await db
    .select({
      id: ticketmasterTeams.id,
      name: ticketmasterTeams.name,
      sport: ticketmasterTeams.sport,
      league: ticketmasterTeams.league,
      images: ticketmasterTeams.images,
      syncedAt: ticketmasterTeams.syncedAt,
    })
    .from(ticketmasterTeams)
    .where(condition)
    .orderBy(asc(ticketmasterTeams.name))
    .limit(query.size)
    .offset(query.page * query.size);
  return {
    items: rows,
    page: {
      number: query.page,
      size: query.size,
      totalElements: total?.value ?? 0,
      totalPages: Math.ceil((total?.value ?? 0) / query.size),
    },
  };
}

export async function getStoredTeam(id: string) {
  const [team] = await getDb()
    .select()
    .from(ticketmasterTeams)
    .where(eq(ticketmasterTeams.id, id))
    .limit(1);
  if (!team) return null;
  const matches = await getDb()
    .select({
      id: ticketmasterMatches.id,
      name: ticketmasterMatches.name,
      startUtc: ticketmasterMatches.startUtc,
    })
    .from(ticketmasterMatchTeams)
    .innerJoin(ticketmasterMatches, eq(ticketmasterMatches.id, ticketmasterMatchTeams.matchId))
    .where(eq(ticketmasterMatchTeams.teamId, id))
    .orderBy(asc(ticketmasterMatches.startUtc))
    .limit(100);
  return { ...team, matches };
}

export async function upsertDiscoveryTeam(raw: JsonObject) {
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) throw new Error("Ticketmaster attraction response is missing its id or name.");
  const classification = eventClassification({ classifications: raw.classifications });
  const now = new Date();
  const fields = {
    name,
    sport: classification.sport,
    league: classification.league,
    images: Array.isArray(raw.images) ? raw.images : [],
    raw,
    syncedAt: now,
  };
  await getDb().insert(ticketmasterTeams).values({ id, ...fields }).onConflictDoUpdate({
    target: ticketmasterTeams.id,
    set: fields,
  });
}

export async function listStoredSports() {
  return getDb()
    .select({
      id: ticketmasterSports.id,
      name: ticketmasterSports.name,
      level: ticketmasterSports.level,
      parentId: ticketmasterSports.parentId,
    })
    .from(ticketmasterSports)
    .orderBy(asc(ticketmasterSports.level), asc(ticketmasterSports.name));
}

export async function upsertDiscoverySports(rows: Array<{
  id: string;
  name: string;
  level: string;
  parentId: string | null;
  raw: JsonObject;
}>) {
  const now = new Date();
  for (const row of rows) {
    const fields = {
      name: row.name,
      level: row.level,
      parentId: row.parentId,
      raw: row.raw,
      syncedAt: now,
    };
    await getDb().insert(ticketmasterSports).values({ id: row.id, ...fields }).onConflictDoUpdate({
      target: ticketmasterSports.id,
      set: fields,
    });
  }
}
