import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

type PostgresClient = ReturnType<typeof postgres>;

declare global {
  var __frontrowSql: PostgresClient | undefined;
  var __frontrowDb: Database | undefined;
}

/**
 * Lazily build the pool. Cached on `globalThis` so Next.js dev-server module
 * reloads do not leak a new connection pool on every hot update.
 */
export function getDb(): Database {
  if (globalThis.__frontrowDb) return globalThis.__frontrowDb;

  const sql = postgres(databaseUrl(), {
    max: 10,
    idle_timeout: 20,
    // Required when sitting behind PgBouncer / Supabase poolers.
    prepare: false,
  });

  globalThis.__frontrowSql = sql;
  globalThis.__frontrowDb = drizzle(sql, { schema });
  return globalThis.__frontrowDb;
}

/** Used by scripts (seed, reconciliation) so the process can exit cleanly. */
export async function closeDb() {
  await globalThis.__frontrowSql?.end({ timeout: 5 });
  globalThis.__frontrowSql = undefined;
  globalThis.__frontrowDb = undefined;
}

export { schema };
export * from "./schema";
