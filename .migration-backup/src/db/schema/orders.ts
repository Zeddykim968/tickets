import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyEnum, events } from "./events";
import { sectionCategoryEnum } from "./sections";
import { seats, viewQualityEnum } from "./seats";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "abandoned",
  "refunded",
]);

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/**
 * An order is created the moment a hold is acquired (status = "pending") and
 * is only promoted to "paid" by the Paystack webhook. The row is therefore the
 * durable record of a hold, which is what makes the Redis TTL safe: if the TTL
 * lapses, the pending order is simply swept as "abandoned".
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Paystack reference. Unique so webhook replays are idempotent. */
    reference: text("reference").notNull(),
    /** The Redis hold id this order was born from. One order per hold. */
    holdId: uuid("hold_id").notNull(),

    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),

    buyerEmail: text("buyer_email").notNull(),
    buyerName: text("buyer_name"),
    buyerPhone: text("buyer_phone"),

    currency: currencyEnum("currency").notNull().default("NGN"),
    subtotalCents: integer("subtotal_cents").notNull(),
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),

    status: orderStatusEnum("status").notNull().default("pending"),

    /** Mirrors the Redis hold deadline; the checkout page hard-fails past this. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    paystackAuthorizationUrl: text("paystack_authorization_url"),
    paystackAccessCode: text("paystack_access_code"),
    paystackChannel: text("paystack_channel"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    failureReason: text("failure_reason"),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_reference_uq").on(t.reference),
    uniqueIndex("orders_hold_uq").on(t.holdId),
    index("orders_event_idx").on(t.eventId),
    index("orders_status_idx").on(t.status),
    index("orders_buyer_email_idx").on(t.buyerEmail),
  ],
);

/**
 * One row per seat in the order. Prices and labels are *snapshotted* here so a
 * receipt disputes can be settled even after the seller edits or delists the
 * underlying seat.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),

    sectionLabel: text("section_label").notNull(),
    rowLabel: text("row_label").notNull(),
    seatNumber: text("seat_number").notNull(),
    category: sectionCategoryEnum("category").notNull(),
    viewQuality: viewQualityEnum("view_quality").notNull(),

    unitPriceCents: integer("unit_price_cents").notNull(),
    originalPriceCents: integer("original_price_cents"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_items_order_seat_uq").on(t.orderId, t.seatId),
    index("order_items_order_idx").on(t.orderId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
