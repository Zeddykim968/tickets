import { z } from "zod";

/**
 * Environment access is *lazy* and *per-subsystem*.
 *
 * **Lazy** because Next.js executes route modules at build time to collect
 * metadata - reading `process.env` at module scope would make `next build` fail
 * on a machine with no database.
 *
 * **Per-subsystem** because one "validate the whole environment" schema couples
 * everything to everything: a deployment that has Postgres and Redis but has
 * not configured every integration would find its availability endpoint
 * throwing about an unrelated key. Each accessor below validates only the
 * variables it actually needs, and reports only those.
 */

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
});

function describeMissing(error: z.ZodError, fileHint: string) {
  const issues = error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  return `Missing or invalid environment variables.\n${issues}\n\nCopy ${fileHint} to .env.local and fill it in.`;
}

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

let cachedDatabaseUrl: string | null = null;

export function databaseUrl(): string {
  if (cachedDatabaseUrl) return cachedDatabaseUrl;

  const parsed = databaseEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(describeMissing(parsed.error, ".env.example"));

  cachedDatabaseUrl = parsed.data.DATABASE_URL;
  return cachedDatabaseUrl;
}

// ---------------------------------------------------------------------------
// Optional tuning - each independently defaulted, none can throw.
// ---------------------------------------------------------------------------

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Redis connection string for the seat-hold engine. */
export function redisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://localhost:6379";
}

/** Seat hold lifetime in seconds. 600 = the 10-minute window. */
export function holdTtlSeconds(): number {
  return positiveInt(process.env.HOLD_TTL_SECONDS, 600);
}

/** Marketplace service fee in basis points (750 = 7.5%). */
export function platformFeeBps(): number {
  return positiveInt(process.env.PLATFORM_FEE_BPS, 750);
}

/**
 * Values inlined into the browser bundle. Each `process.env.NEXT_PUBLIC_*`
 * access must stay a literal for the Next.js compiler to substitute it.
 */
export function publicEnv() {
  return {
    appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  };
}
