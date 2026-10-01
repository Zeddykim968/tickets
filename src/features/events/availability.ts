import { getLockedSeatIds } from "@/features/holds/redis";
import { discountPercent } from "@/lib/money";
import { getListedSeatRefs, getSectionSummaries } from "./queries";
import type { AvailabilityPayload, SectionAvailability, SectionSummary } from "./types";

/**
 * Merge the two sources of truth for "can I buy this right now?":
 *
 *  - Postgres owns the durable record  -> listed / sold inventory
 *  - Redis owns the live 10-minute lock -> seats inside somebody's cart
 *
 * `available = listed - sold - held`. Nothing is cached here beyond the
 * request, so a poll always reflects both.
 */
export function buildSectionAvailability(
  section: SectionSummary,
  heldCount: number,
): SectionAvailability {
  const total = section.listedCount;
  // Clamp: a lock can outlive a sale by a few milliseconds, and the badge must
  // never read "-1 seats left".
  const held = Math.min(Math.max(heldCount, 0), Math.max(total - section.soldCount, 0));
  const available = Math.max(total - section.soldCount - held, 0);

  return {
    sectionId: section.id,
    total,
    available,
    held,
    sold: section.soldCount,
    minPriceCents: section.minPriceCents,
    originalMinPriceCents: section.originalMinPriceCents,
    discountPercent: discountPercent(section.originalMinPriceCents, section.minPriceCents ?? 0),
    bestViewQuality: section.bestViewQuality,
    hasRestrictedView: section.hasRestrictedView,
    soldOut: available === 0,
  };
}

/**
 * Full availability snapshot for one event: per-section counts plus the raw
 * list of locked seat ids so the listing feed can grey out individual rows
 * without a second round trip.
 */
export async function getEventAvailability(
  eventId: string,
  prefetchedSections?: SectionSummary[],
): Promise<AvailabilityPayload> {
  const [sectionSummaries, seatRefs] = await Promise.all([
    prefetchedSections ? Promise.resolve(prefetchedSections) : getSectionSummaries(eventId),
    getListedSeatRefs(eventId),
  ]);

  const lockedSeatIds = await getLockedSeatIds(
    eventId,
    seatRefs.map((ref) => ref.id),
  );

  const heldBySection = new Map<string, number>();
  for (const ref of seatRefs) {
    if (!lockedSeatIds.has(ref.id)) continue;
    heldBySection.set(ref.sectionId, (heldBySection.get(ref.sectionId) ?? 0) + 1);
  }

  return {
    eventId,
    generatedAt: new Date().toISOString(),
    lockedSeatIds: [...lockedSeatIds],
    sections: sectionSummaries.map((section) =>
      buildSectionAvailability(section, heldBySection.get(section.id) ?? 0),
    ),
  };
}
