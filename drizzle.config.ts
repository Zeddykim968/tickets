import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";


config({ path: ".env.local" });

// drizzle-kit is a separate process: give it the same env the app sees

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
