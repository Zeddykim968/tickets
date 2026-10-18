import { defineConfig } from "drizzle-kit";
import { loadEnvFiles } from "./src/lib/load-env";

// drizzle-kit is a separate process: give it the same env the app sees.
loadEnvFiles();

if (!process.env.DATABASE_URL) {
  // drizzle-kit is a CLI tool: fail loudly rather than emitting a broken migration.
  throw new Error("DATABASE_URL is required to run drizzle-kit. Copy .env.example to .env.local.");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
