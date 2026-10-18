CREATE TYPE "public"."currency_code" AS ENUM('NGN', 'USD', 'GBP', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'on_sale', 'sold_out', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."section_category" AS ENUM('vip', 'premium', 'standard', 'accessible');--> statement-breakpoint
CREATE TYPE "public"."seat_status" AS ENUM('available', 'held', 'sold');--> statement-breakpoint
CREATE TYPE "public"."view_quality" AS ENUM('premium', 'clear', 'restricted', 'obstructed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'abandoned', 'refunded');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"competition" text,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"venue_name" text NOT NULL,
	"venue_city" text NOT NULL,
	"venue_country" text DEFAULT 'NG' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"sales_open_at" timestamp with time zone,
	"sales_close_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"currency" "currency_code" DEFAULT 'NGN' NOT NULL,
	"hero_image_url" text,
	"capacity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tier" "section_category" DEFAULT 'standard' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"map_x" integer DEFAULT 50 NOT NULL,
	"map_y" integer DEFAULT 50 NOT NULL,
	"map_width" integer DEFAULT 10 NOT NULL,
	"map_height" integer DEFAULT 10 NOT NULL,
	"map_rotation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"row_label" text NOT NULL,
	"seat_number" text NOT NULL,
	"category" "section_category" DEFAULT 'standard' NOT NULL,
	"view_quality" "view_quality" DEFAULT 'clear' NOT NULL,
	"view_note" text,
	"is_aisle" boolean DEFAULT false NOT NULL,
	"is_listed" boolean DEFAULT true NOT NULL,
	"price_cents" integer NOT NULL,
	"original_price_cents" integer,
	"status" "seat_status" DEFAULT 'available' NOT NULL,
	"hold_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"listed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seats_price_non_negative" CHECK ("seats"."price_cents" >= 0),
	CONSTRAINT "seats_original_price_non_negative" CHECK ("seats"."original_price_cents" is null or "seats"."original_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"section_label" text NOT NULL,
	"row_label" text NOT NULL,
	"seat_number" text NOT NULL,
	"category" "section_category" NOT NULL,
	"view_quality" "view_quality" NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"original_price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"hold_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_name" text,
	"buyer_phone" text,
	"currency" "currency_code" DEFAULT 'NGN' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"service_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paystack_authorization_url" text,
	"paystack_access_code" text,
	"paystack_channel" text,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_uq" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_event_code_uq" ON "sections" USING btree ("event_id","code");--> statement-breakpoint
CREATE INDEX "sections_event_idx" ON "sections" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_event_position_uq" ON "seats" USING btree ("event_id","section_id","row_label","seat_number");--> statement-breakpoint
CREATE INDEX "seats_event_status_idx" ON "seats" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "seats_event_section_idx" ON "seats" USING btree ("event_id","section_id");--> statement-breakpoint
CREATE INDEX "seats_event_price_idx" ON "seats" USING btree ("event_id","price_cents");--> statement-breakpoint
CREATE INDEX "seats_event_view_quality_idx" ON "seats" USING btree ("event_id","view_quality");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_seat_uq" ON "order_items" USING btree ("order_id","seat_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_reference_uq" ON "orders" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_hold_uq" ON "orders" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "orders_event_idx" ON "orders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_buyer_email_idx" ON "orders" USING btree ("buyer_email");