import type { CurrencyCode, EventStatus } from "@/db/schema/events";
import type { SectionCategory } from "@/db/schema/sections";
import type { SeatStatus, ViewQuality } from "@/db/schema/seats";

export type { CurrencyCode, EventStatus, SeatStatus, SectionCategory, ViewQuality };

export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  competition: string | null;
  homeTeam: string;
  awayTeam: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  status: EventStatus;
  currency: CurrencyCode;
  heroImageUrl: string | null;
  capacity: number;
  /** Live listing count, so the marketplace card can show "312 tickets". */
  listingCount: number;
  minPriceCents: number | null;
};

/** Where a section sits on the stadium map, in container percentages. */
export type SectionMapPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

/** Static facts about a section - rendered once, never polled. */
export type SectionSummary = {
  id: string;
  code: string;
  name: string;
  tier: SectionCategory;
  capacity: number;
  map: SectionMapPosition;
  /** Number of seats the sellers have currently listed here. */
  listedCount: number;
  soldCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  /** Cheapest face value in the section - the "was" price for the badge. */
  originalMinPriceCents: number | null;
  discountPercent: number;
  bestViewQuality: ViewQuality;
  hasRestrictedView: boolean;
};

/** Live numbers that change while the buyer looks at the page. */
export type SectionAvailability = {
  sectionId: string;
  total: number;
  available: number;
  held: number;
  sold: number;
  minPriceCents: number | null;
  originalMinPriceCents: number | null;
  discountPercent: number;
  bestViewQuality: ViewQuality;
  hasRestrictedView: boolean;
  soldOut: boolean;
};

export type AvailabilityPayload = {
  eventId: string;
  generatedAt: string;
  /** Seats currently inside somebody's 10-minute window. */
  lockedSeatIds: string[];
  sections: SectionAvailability[];
};

export type ListingSort = "price_asc" | "price_desc" | "row" | "best_value";

export type TicketListing = {
  id: string;
  sectionId: string;
  sectionCode: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: string;
  category: SectionCategory;
  viewQuality: ViewQuality;
  viewNote: string | null;
  isAisle: boolean;
  priceCents: number;
  originalPriceCents: number | null;
  discountPercent: number;
  savingsCents: number;
  status: SeatStatus;
  isListed: boolean;
};

export type ListingQuery = {
  sectionId?: string;
  viewQuality?: ViewQuality[];
  sort?: ListingSort;
  limit?: number;
};
