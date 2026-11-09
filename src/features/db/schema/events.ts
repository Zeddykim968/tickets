import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const eventStatusEnum = pgEnum("event_status", [
  "scheduled",
  "on_sale",
  "sold_out",
  "cancelled",
  "completed",
]);

export const currencyEnum = pgEnum("currency_code", ["NGN", "USD", "GBP", "EUR"]);

export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type CurrencyCode = (typeof currencyEnum.enumValues)[number];

/**
 * A single fixture. The marketplace is event-centric: every section, seat,
 * hold and order hangs off this row, and `starts_at` is the axis the
 * marketplace feed sorts on.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    competition: text("competition"),

    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),

    venueName: text("venue_name").notNull(),
    venueCity: text("venue_city").notNull(),
    venueCountry: text("venue_country").notNull().default("NG"),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    salesOpenAt: timestamp("sales_open_at", { withTimezone: true }),
    salesCloseAt: timestamp("sales_close_at", { withTimezone: true }),

    status: eventStatusEnum("status").notNull().default("scheduled"),
    currency: currencyEnum("currency").notNull().default("NGN"),

    heroImageUrl: text("hero_image_url"),
    /** Denormalised bowl capacity so the picker can render a skeleton fast. */
    capacity: integer("capacity").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_slug_uq").on(t.slug),
    index("events_starts_at_idx").on(t.startsAt),
    index("events_status_idx").on(t.status),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
