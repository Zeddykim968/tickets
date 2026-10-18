/**
 * This module is intentionally dependency-free so that both the server action
 * and the client side Zustand store can import it without dragging node-only
 * code into the browser bundle.
 */

/** Hard cap on a single hold. Keeps the Redis Lua payload and cart sane. */
export const MAX_SEATS_PER_HOLD = 8;

/** How often the buyer-facing availability badges refresh, in milliseconds. */
export const AVAILABILITY_POLL_MS = 12_000;
