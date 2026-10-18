/**
 * Single import surface for the schema.
 * `drizzle.config.ts` and `src/db/index.ts` both point here, so adding a table
 * means editing exactly one line below.
 */
export * from "./events";
export * from "./sections";
export * from "./seats";
export * from "./orders";
