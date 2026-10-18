import type { CurrencyCode } from "@/db/schema";

/** The JSON blob stored at `holdManifestKey`, byte-identical to what Lua writes. */
export type HoldManifest = {
  holdId: string;
  eventId: string;
  seatIds: string[];
  currency: CurrencyCode;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. Derived from the Redis TTL, not from the client. */
  expiresAt: string;
};

export type AcquireHoldResult =
  | { ok: true; manifest: HoldManifest; ttlSeconds: number }
  | { ok: false; reason: "conflict"; conflictingSeatIds: string[] }
  | { ok: false; reason: "invalid"; message: string };

export type ReserveSeatsFailureReason =
  | "validation"
  | "unavailable"
  | "already_held"
  | "error";

/**
 * Discriminated union returned straight to the client action caller, so the UI
 * can branch on `ok` with full type narrowing and no exceptions crossing the
 * server/client boundary.
 */
export type ReserveSeatsResult =
  | {
      ok: true;
      holdId: string;
      reference: string;
      /** ISO timestamp of the hard deadline. */
      expiresAt: string;
      ttlSeconds: number;
      redirectTo: string;
    }
  | {
      ok: false;
      reason: ReserveSeatsFailureReason;
      message: string;
      conflictingSeatIds?: string[];
    };

export type ReleaseHoldResult = { ok: boolean; released: number };
