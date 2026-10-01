import { platformFeeBps } from "@/lib/env";

export { platformFeeBps };

export type OrderTotals = {
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  serviceFeeBps: number;
};

/**
 * Fees are computed once, server-side, from the *database* price of each seat.
 * The client never sends a price and never sends a total - it only sends seat
 * ids - so a tampered request cannot change what is charged.
 */
export function calculateOrderTotals(
  unitPricesCents: number[],
  feeBps = platformFeeBps(),
): OrderTotals {
  const subtotalCents = unitPricesCents.reduce((sum, price) => sum + price, 0);
  const serviceFeeCents = Math.round((subtotalCents * feeBps) / 10_000);

  return {
    subtotalCents,
    serviceFeeCents,
    totalCents: subtotalCents + serviceFeeCents,
    serviceFeeBps: feeBps,
  };
}
