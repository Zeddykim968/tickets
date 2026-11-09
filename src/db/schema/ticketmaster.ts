import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const ticketmasterVenues = pgTable(
  "ticketmaster_venues",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    city: text("city"),
    stateCode: text("state_code"),
    countryCode: text("country_code"),
    timezone: text("timezone"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    currency: text("currency"),
    seatmapUrl: text("seatmap_url"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ticketmaster_venues_city_idx").on(table.city),
    index("ticketmaster_venues_country_idx").on(table.countryCode),
  ],
);

export const ticketmasterTeams = pgTable(
  "ticketmaster_teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sport: text("sport"),
    league: text("league"),
    images: jsonb("images").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ticketmaster_teams_name_idx").on(table.name)],
);

export const ticketmasterSports = pgTable("ticketmaster_sports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  parentId: text("parent_id"),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketmasterMatches = pgTable(
  "ticketmaster_matches",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    venueId: text("venue_id").references(() => ticketmasterVenues.id, { onDelete: "set null" }),
    startUtc: timestamp("start_utc", { withTimezone: true }),
    localDate: text("local_date"),
    localTime: text("local_time"),
    saleStatus: text("sale_status"),
    onsaleStart: timestamp("onsale_start", { withTimezone: true }),
    onsaleEnd: timestamp("onsale_end", { withTimezone: true }),
    priceMin: numeric("price_min", { precision: 12, scale: 2 }),
    priceMax: numeric("price_max", { precision: 12, scale: 2 }),
    currency: text("currency"),
    sport: text("sport"),
    league: text("league"),
    buyUrl: text("buy_url"),
    seatmapStatic: text("seatmap_static"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ticketmaster_matches_start_idx").on(table.startUtc),
    index("ticketmaster_matches_status_idx").on(table.saleStatus),
    index("ticketmaster_matches_venue_idx").on(table.venueId),
    index("ticketmaster_matches_city_idx").on(table.sport, table.league),
  ],
);

export const ticketmasterMatchTeams = pgTable(
  "ticketmaster_match_teams",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => ticketmasterMatches.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => ticketmasterTeams.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.teamId], name: "ticketmaster_match_teams_pk" }),
    index("ticketmaster_match_teams_team_idx").on(table.teamId),
  ],
);

export const ticketmasterIdCrosswalk = pgTable("ticketmaster_id_crosswalk", {
  discoveryId: text("discovery_id")
    .primaryKey()
    .references(() => ticketmasterMatches.id, { onDelete: "cascade" }),
  hostEventId: text("host_event_id"),
  universalId: text("universal_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export type TicketmasterVenue = typeof ticketmasterVenues.$inferSelect;
export type TicketmasterTeam = typeof ticketmasterTeams.$inferSelect;
export type TicketmasterMatch = typeof ticketmasterMatches.$inferSelect;
