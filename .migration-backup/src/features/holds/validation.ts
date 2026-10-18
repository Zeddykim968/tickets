import { z } from "zod";
import { MAX_SEATS_PER_HOLD } from "./constants";

/**
 * Never trust the browser. Seat ids are uuid-validated (so they can only ever
 * be used in a parameterised query) and capped at the hold limit, and the
 * buyer email is normalised before it reaches Paystack.
 */
export const reserveSeatsSchema = z.object({
  eventId: z.string().uuid(),
  seatIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one seat.")
    .max(MAX_SEATS_PER_HOLD, `You can hold at most ${MAX_SEATS_PER_HOLD} seats.`),
  buyerEmail: z.string().trim().toLowerCase().email("Enter a valid email address."),
  buyerName: z.string().trim().min(2).max(120).optional(),
});

export type ReserveSeatsInput = z.infer<typeof reserveSeatsSchema>;

export const releaseHoldSchema = z.object({
  holdId: z.string().uuid(),
});
