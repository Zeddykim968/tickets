CREATE TABLE "ticketmaster_id_crosswalk" (
	"discovery_id" text PRIMARY KEY NOT NULL,
	"host_event_id" text,
	"universal_id" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticketmaster_match_teams" (
	"match_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role" text,
	CONSTRAINT "ticketmaster_match_teams_pk" PRIMARY KEY("match_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "ticketmaster_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"venue_id" text,
	"start_utc" timestamp with time zone,
	"local_date" text,
	"local_time" text,
	"sale_status" text,
	"onsale_start" timestamp with time zone,
	"onsale_end" timestamp with time zone,
	"price_min" numeric(12, 2),
	"price_max" numeric(12, 2),
	"currency" text,
	"sport" text,
	"league" text,
	"buy_url" text,
	"seatmap_static" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketmaster_sports" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketmaster_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" text,
	"league" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticketmaster_venues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state_code" text,
	"country_code" text,
	"timezone" text,
	"latitude" real,
	"longitude" real,
	"currency" text,
	"seatmap_url" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticketmaster_id_crosswalk" ADD CONSTRAINT "ticketmaster_id_crosswalk_discovery_id_ticketmaster_matches_id_fk" FOREIGN KEY ("discovery_id") REFERENCES "public"."ticketmaster_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketmaster_match_teams" ADD CONSTRAINT "ticketmaster_match_teams_match_id_ticketmaster_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."ticketmaster_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketmaster_match_teams" ADD CONSTRAINT "ticketmaster_match_teams_team_id_ticketmaster_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."ticketmaster_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticketmaster_matches" ADD CONSTRAINT "ticketmaster_matches_venue_id_ticketmaster_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."ticketmaster_venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticketmaster_match_teams_team_idx" ON "ticketmaster_match_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "ticketmaster_matches_start_idx" ON "ticketmaster_matches" USING btree ("start_utc");--> statement-breakpoint
CREATE INDEX "ticketmaster_matches_status_idx" ON "ticketmaster_matches" USING btree ("sale_status");--> statement-breakpoint
CREATE INDEX "ticketmaster_matches_venue_idx" ON "ticketmaster_matches" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "ticketmaster_matches_city_idx" ON "ticketmaster_matches" USING btree ("sport","league");--> statement-breakpoint
CREATE INDEX "ticketmaster_teams_name_idx" ON "ticketmaster_teams" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ticketmaster_venues_city_idx" ON "ticketmaster_venues" USING btree ("city");--> statement-breakpoint
CREATE INDEX "ticketmaster_venues_country_idx" ON "ticketmaster_venues" USING btree ("country_code");