import "server-only";
import { z } from "zod";

const ticketmasterEnvSchema = z.object({
  TICKETMASTER_API_KEY: z.string().trim().min(1),
});

export function ticketmasterApiKey() {
  const parsed = ticketmasterEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Ticketmaster Discovery API is not configured. Set TICKETMASTER_API_KEY on the server.");
  }
  return parsed.data.TICKETMASTER_API_KEY;
}

export function ticketmasterMarkets() {
  return (process.env.TICKETMASTER_MARKET_IDS ?? "")
    .split(",")
    .map((market) => market.trim())
    .filter(Boolean);
}
