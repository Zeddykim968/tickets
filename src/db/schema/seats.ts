import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { sectionCategoryEnum, sections } from "./sections";

export const viewQualityEnum = pgEnum("view_quality", [
  "premium",
  "clear",
  "restricted",
  "obstructed",
]);

export const seatStatusEnum = pgEnum("seat_status", ["available", "held", "sold"]);

export type ViewQuality = (typeof viewQualityEnum.enumValues)[number];
export type SeatStatus = (typeof seatStatusEnum.enumValues)[number];

/**
 * A seat doubles as a *listing*: in a resale marketplace the row is the
 * inventory a seller has made available, so `price_cents` is the asking price
 * and `original_price_cents` is the face value it was bought for.
 */
export const seats = pgTable(
  "seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),

    /** `row` is a SQL keyword, so the column is explicitly named row_label. */
    rowLabel: text("row_label").notNull(),
    seatNumber: text("seat_number").notNull(),

    category: sectionCategoryEnum("category").notNull().default("standard"),
    /** Drives the "Clear view" / "Restricted view" flag in the listing feed. */
    viewQuality: viewQualityEnum("view_quality").notNull().default("clear"),
    /** Seller supplied note, e.g. "Level with the halfway line". */
    viewNote: text("view_note"),
    isAisle: boolean("is_aisle").notNull().default(false),

    /** Sellers can delist without deleting the inventory row. */
    isListed: boolean("is_listed").notNull().default(true),

    /** Asking price in minor units (kobo for NGN). */
    priceCents: integer("price_cents").notNull(),
    /** Face value - the baseline for the discount indicator. */
    originalPriceCents: integer("original_price_cents"),

    status: seatStatusEnum("status").notNull().default("available"),

    /**
     * Denormalised mirror of the authoritative Redis hold. Redis owns the
     * 10-minute TTL gate; these two columns exist so support, reconciliation
     * jobs and the order history can explain *who* held a seat and *when*.
     */
    holdId: uuid("hold_id"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),

    listedAt: timestamp("listed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("seats_event_position_uq").on(t.eventId, t.sectionId, t.rowLabel, t.seatNumber),
    index("seats_event_status_idx").on(t.eventId, t.status),
    index("seats_event_section_idx").on(t.eventId, t.sectionId),
    index("seats_event_price_idx").on(t.eventId, t.priceCents),
    index("seats_event_view_quality_idx").on(t.eventId, t.viewQuality),
    check("seats_price_non_negative", sql`${t.priceCents} >= 0`),
    check(
      "seats_original_price_non_negative",
      sql`${t.originalPriceCents} is null or ${t.originalPriceCents} >= 0`,
    ),
  ],
);

export type Seat = typeof seats.$inferSelect;
export type NewSeat = typeof seats.$inferInsert;
