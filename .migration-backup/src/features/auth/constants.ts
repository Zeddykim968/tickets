/**
 * Cookie name for the demo session.
 *
 * Deliberately kept out of `actions.ts`: a `"use server"` module may only
 * export async functions, and both the middleware and the server actions need
 * to agree on this string.
 */
export const SESSION_COOKIE = "frontrow_session";

/** Routes that require a session. Checkout is intentionally NOT one of them. */
export const PROTECTED_PREFIXES = ["/account", "/sell"];
