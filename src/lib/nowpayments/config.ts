import "server-only";
import { z } from "zod";

const nowPaymentsEnvSchema = z.object({
  NOWPAYMENTS_BASE_URL: z.string().trim().min(1).url(),
  NOWPAYMENTS_API_KEY: z.string().trim().min(1),
  NOWPAYMENTS_IPN_SECRET: z.string().trim().min(1),
  APP_URL: z.string().trim().min(1).url(),
});

export type NowPaymentsConfig = z.infer<typeof nowPaymentsEnvSchema>;

let cachedConfig: NowPaymentsConfig | null = null;

function describeMissing(error: z.ZodError) {
  const issues = error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");

  return [
    "Missing or invalid NOWPayments environment variables.",
    issues,
    "",
    "Copy .env.example to .env.local and fill in the configuration.",
  ].join("\n");
}

export function nowPaymentsConfig(): NowPaymentsConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = nowPaymentsEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(describeMissing(parsed.error));

  const baseUrl = parsed.data.NOWPAYMENTS_BASE_URL.toLowerCase();
  if (process.env.NODE_ENV === "production" && baseUrl.includes("sandbox")) {
    throw new Error("NOWPayments sandbox credentials are not allowed in production. Set NOWPAYMENTS_BASE_URL to the production API URL.");
  }
  if (process.env.NODE_ENV !== "production" && !baseUrl.includes("sandbox")) {
    throw new Error("Use NOWPayments sandbox credentials in local development. Set NOWPAYMENTS_BASE_URL to the sandbox API URL.");
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
