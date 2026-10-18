import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";

export const sectionCategoryEnum = pgEnum("section_category", [
  "vip",
  "premium",
  "standard",
  "accessible",
]);

export type SectionCategory = (typeof sectionCategoryEnum.enumValues)[number];

/**
 * Supporting table (not in the original brief, but the interactive stadium
 * picker needs geometry per section, and duplicating x/y onto every seat row
 * would be pure denormalisation).
 *
 * `map_x` / `map_y` / `map_width` / `map_height` are percentages of the
 * stadium container, so the pitch SVG scales with the viewport without any
 * layout maths on the client.
 */
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    /** Short code shown on the map, e.g. "N1", "E12". */
    code: text("code").notNull(),
    /** Human label, e.g. "North Stand Upper". */
    name: text("name").notNull(),
    tier: sectionCategoryEnum("tier").notNull().default("standard"),

    /** Number of physical seats, listed or not. */
    capacity: integer("capacity").notNull().default(0),

    mapX: integer("map_x").notNull().default(50),
    mapY: integer("map_y").notNull().default(50),
    mapWidth: integer("map_width").notNull().default(10),
    mapHeight: integer("map_height").notNull().default(10),
    /** Rotation in degrees so side stands can be tilted around the pitch. */
    mapRotation: integer("map_rotation").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sections_event_code_uq").on(t.eventId, t.code),
    index("sections_event_idx").on(t.eventId),
  ],
);

export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;
