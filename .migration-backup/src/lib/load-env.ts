import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env.local", ".env"];
const quoted = /^(['"])(.*)\1$/;

/**
 * Tiny, dependency-free env loader for the CLI scripts (seeding, drizzle-kit).
 *
 * Next.js loads `.env.local` for the app, but plain `tsx` does not, and the
 * seed would otherwise blow up with "DATABASE_URL is required" on a machine
 * that is configured perfectly well. Existing `process.env` values always win,
 * so `DATABASE_URL=... npm run db:seed` still overrides the file.
 */
export function loadEnvFiles(cwd = process.cwd()) {
  let loaded = 0;

  for (const file of ENV_FILES) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separator + 1).trim();
      const match = quoted.exec(value);
      if (match) value = match[2] ?? "";

      process.env[key] = value;
      loaded += 1;
    }
  }

  return loaded;
}
