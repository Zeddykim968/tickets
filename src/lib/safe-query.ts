export type QueryResult<T> = {
  data: T;
  /** Populated when the query threw - usually "no DATABASE_URL configured". */
  error: string | null;
};

/**
 * Run a read query and degrade gracefully.
 *
 * A fresh clone has no `.env.local`, so `getDb()` throws on connect. Turning
 * that into an empty result plus a "finish setup" banner is far friendlier than
 * an unhandled 500 on the very first page load - and it keeps `next build`'s
 * static analysis honest.
 *
 * Never use this for writes or for money paths: those must fail loudly.
 */
export async function tryQuery<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<QueryResult<T>> {
  try {
    return { data: await run(), error: null };
  } catch (cause) {
  const root: any = (cause as any)?.cause ?? cause;
  const message = root?.message || root?.errors?.map((e: any) => `${e.address}:${e.port} ${e.code}`).join(", ") || String(root);
  console.error(`[query:${label}] ${message}`, "| code:", root?.code);
  return { data: fallback, error: message };
}
}
