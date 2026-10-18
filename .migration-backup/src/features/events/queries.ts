import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { events, seats, sections } from "@/db/schema";
import { discountPercent, savings } from "@/lib/money";
import type {
  EventSummary,
  ListingQuery,
  SectionSummary,
  TicketListing,
  ViewQuality,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rank used to collapse a section's mixed view qualities into one badge. */
const VIEW_QUALITY_BY_RANK: ViewQuality[] = ["premium", "clear", "restricted", "obstructed"];

function viewQualityFromRank(rank: number | null): ViewQuality {
  return VIEW_QUALITY_BY_RANK[rank ?? 0] ?? "clear";
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Marketplace feed: soonest fixture first, with live price + inventory. */
export async function listEvents(options: { limit?: number } = {}): Promise<EventSummary[]> {
  const rows = await getDb()
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      competition: events.competition,
      homeTeam: events.homeTeam,
      awayTeam: events.awayTeam,
      venueName: events.venueName,
      venueCity: events.venueCity,
      startsAt: events.startsAt,
      status: events.status,
      currency: events.currency,
      heroImageUrl: events.heroImageUrl,
      capacity: events.capacity,
      listingCount: sql<number>`count(${seats.id})::int`,
      minPriceCents: sql<number | null>`min(${seats.priceCents})::int`,
    })
    .from(events)
    .leftJoin(
      seats,
      and(eq(seats.eventId, events.id), eq(seats.isListed, true), eq(seats.status, "available")),
    )
    .groupBy(events.id)
    .orderBy(asc(events.startsAt))
    .limit(options.limit ?? 24);

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
  }));
}

/** Accepts either a UUID or the SEO slug, so `/events/[eventId]` serves both. */
export async function getEventBySlugOrId(key: string) {
  const [row] = await getDb()
    .select()
    .from(events)
    .where(UUID_RE.test(key) ? eq(events.id, key) : eq(events.slug, key))
    .limit(1);

  return row ?? null;
}

export type EventRecord = NonNullable<Awaited<ReturnType<typeof getEventBySlugOrId>>>;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * One aggregate query for the whole stadium. Everything the picker needs to
 * paint a section card - cheapest price, discount vs face value, worst view
 * quality - is derived here so the client never fans out per section.
 */
export async function getSectionSummaries(eventId: string): Promise<SectionSummary[]> {
  const rank = sql<number>`min(
    case ${seats.viewQuality}
      when 'premium' then 0
      when 'clear' then 1
      when 'restricted' then 2
      when 'obstructed' then 3
      else 0
    end
  )`;

  const rows = await getDb()
    .select({
      id: sections.id,
      code: sections.code,
      name: sections.name,
      tier: sections.tier,
      capacity: sections.capacity,
      mapX: sections.mapX,
      mapY: sections.mapY,
      mapWidth: sections.mapWidth,
      mapHeight: sections.mapHeight,
      mapRotation: sections.mapRotation,
      listedCount: sql<number>`count(${seats.id})::int`,
      soldCount: sql<number>`(count(${seats.id}) filter (where ${seats.status} = 'sold'))::int`,
      minPriceCents: sql<number | null>`min(${seats.priceCents})::int`,
      maxPriceCents: sql<number | null>`max(${seats.priceCents})::int`,
      // The face value of the *cheapest* seat, not the cheapest face value in
      // the section. Those are different numbers, and pairing the wrong one
      // with the price tag would advertise a discount that does not exist.
      originalMinPriceCents: sql<
        number | null
      >`((array_agg(coalesce(${seats.originalPriceCents}, ${seats.priceCents}) order by ${seats.priceCents} asc))[1])::int`,
      bestViewQualityRank: rank,
      restrictedCount: sql<number>`(count(${seats.id}) filter (where ${seats.viewQuality} in ('restricted', 'obstructed')))::int`,
    })
    .from(sections)
    .leftJoin(seats, and(eq(seats.sectionId, sections.id), eq(seats.isListed, true)))
    .where(eq(sections.eventId, eventId))
    .groupBy(sections.id)
    .orderBy(asc(sections.code));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    tier: row.tier,
    capacity: row.capacity,
    map: {
      x: row.mapX,
      y: row.mapY,
      width: row.mapWidth,
      height: row.mapHeight,
      rotation: row.mapRotation,
    },
    listedCount: row.listedCount,
    soldCount: row.soldCount,
    minPriceCents: row.minPriceCents,
    maxPriceCents: row.maxPriceCents,
    originalMinPriceCents: row.originalMinPriceCents,
    discountPercent: discountPercent(row.originalMinPriceCents, row.minPriceCents ?? 0),
    bestViewQuality: viewQualityFromRank(row.bestViewQualityRank),
    hasRestrictedView: row.restrictedCount > 0,
  }));
}

/** Minimal seat projection used to reconcile Postgres with the Redis locks. */
export async function getListedSeatRefs(eventId: string) {
  return getDb()
    .select({ id: seats.id, sectionId: seats.sectionId })
    .from(seats)
    .where(
      and(eq(seats.eventId, eventId), eq(seats.isListed, true), sql`${seats.status} <> 'sold'`),
    );
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

function orderByFor(sort: ListingQuery["sort"]): SQL | ReturnType<typeof asc> {
  switch (sort) {
    case "price_desc":
      return desc(seats.priceCents);
    case "row":
      return asc(seats.rowLabel);
    case "best_value":
      // Biggest absolute saving first; seats listed at face value fall to the bottom.
      return sql`(coalesce(${seats.originalPriceCents}, ${seats.priceCents}) - ${seats.priceCents}) desc`;
    case "price_asc":
    default:
      return asc(seats.priceCents);
  }
}

/**
 * The ticket feed. Row numbers, seat numbers, view-quality flags and the
 * discount versus face value are all resolved here - the client receives
 * render-ready rows and never has to compute money.
 */
export async function getListings(eventId: string, query: ListingQuery = {}): Promise<TicketListing[]> {
  const conditions = [eq(seats.eventId, eventId), eq(seats.isListed, true)];

  if (query.sectionId) conditions.push(eq(seats.sectionId, query.sectionId));
  if (query.viewQuality?.length) conditions.push(inArray(seats.viewQuality, query.viewQuality));

  const rows = await getDb()
    .select({
      id: seats.id,
      sectionId: seats.sectionId,
      sectionCode: sections.code,
      sectionName: sections.name,
      rowLabel: seats.rowLabel,
      seatNumber: seats.seatNumber,
      category: seats.category,
      viewQuality: seats.viewQuality,
      viewNote: seats.viewNote,
      isAisle: seats.isAisle,
      priceCents: seats.priceCents,
      originalPriceCents: seats.originalPriceCents,
      status: seats.status,
      isListed: seats.isListed,
    })
    .from(seats)
    .innerJoin(sections, eq(seats.sectionId, sections.id))
    .where(and(...conditions))
    .orderBy(orderByFor(query.sort), asc(seats.seatNumber))
    .limit(query.limit ?? 120);

  return rows.map((row) => ({
    ...row,
    discountPercent: discountPercent(row.originalPriceCents, row.priceCents),
    savingsCents: savings(row.originalPriceCents, row.priceCents),
  }));
}

/**
 * Load the exact seats a hold is about to cover. Only *listed, available* rows
 * are returned, so a caller can detect "somebody else bought these" by
 * comparing the row count with the number of ids requested.
 */
export async function getReservableSeats(eventId: string, seatIds: string[]) {
  // Written as a never-matching predicate rather than an early `return []`, so
  // the function has a single return type. An early empty-array return would
  // widen it to `never[] | Row[]`, and calling `.map` on that union is a
  // TypeScript error ("none of those signatures are compatible").
  const seatIdCondition = seatIds.length > 0 ? inArray(seats.id, seatIds) : sql`false`;

  return getDb()
    .select({
      id: seats.id,
      sectionId: seats.sectionId,
      sectionCode: sections.code,
      sectionName: sections.name,
      rowLabel: seats.rowLabel,
      seatNumber: seats.seatNumber,
      category: seats.category,
      viewQuality: seats.viewQuality,
      viewNote: seats.viewNote,
      priceCents: seats.priceCents,
      originalPriceCents: seats.originalPriceCents,
      status: seats.status,
      /** Carried along so the hold can be denominated without a second query. */
      currency: events.currency,
    })
    .from(seats)
    .innerJoin(sections, eq(seats.sectionId, sections.id))
    .innerJoin(events, eq(seats.eventId, events.id))
    .where(
      and(
        eq(seats.eventId, eventId),
        seatIdCondition,
        eq(seats.isListed, true),
        eq(seats.status, "available"),
      ),
    );
}

export type ReservableSeat = Awaited<ReturnType<typeof getReservableSeats>>[number];

/**
 * Same projection as `getReservableSeats` but deliberately unfiltered by
 * status: once a hold is paid the seats are `sold` and must still be readable
 * for the receipt.
 */
export async function getSeatDetails(eventId: string, seatIds: string[]) {
  // Same single-return-type trick as above.
  const seatIdCondition = seatIds.length > 0 ? inArray(seats.id, seatIds) : sql`false`;

  return getDb()
    .select({
      id: seats.id,
      sectionId: seats.sectionId,
      sectionCode: sections.code,
      sectionName: sections.name,
      rowLabel: seats.rowLabel,
      seatNumber: seats.seatNumber,
      category: seats.category,
      viewQuality: seats.viewQuality,
      viewNote: seats.viewNote,
      priceCents: seats.priceCents,
      originalPriceCents: seats.originalPriceCents,
      status: seats.status,
    })
    .from(seats)
    .innerJoin(sections, eq(seats.sectionId, sections.id))
    .where(and(eq(seats.eventId, eventId), seatIdCondition));
}

export type SeatDetail = Awaited<ReturnType<typeof getSeatDetails>>[number];
