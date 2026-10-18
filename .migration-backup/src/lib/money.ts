/**
 * All money in this codebase is stored as an integer number of *minor units*
 * (kobo for NGN, cents for USD/GBP/EUR). Never floats, never `Money` objects
 * in the database - this matches what Paystack expects in its `amount` field,
 * so no conversion is needed when creating a transaction.
 */
// Re-exported from the schema's `currency_code` enum rather than re-declared, so
// there is exactly one definition of which currencies exist. `import type` is
// erased at compile time, so this pulls nothing into the client bundle.
export type { CurrencyCode } from "@/db/schema/events";

import type { CurrencyCode } from "@/db/schema/events";

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-IE",
};

const MINOR_UNITS_BY_CURRENCY: Record<CurrencyCode, number> = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};

type FormatOptions = {
  /** Drop the decimals when the value is whole - tickets are rarely 50k.01 */
  compact?: boolean;
};

export function formatMoney(minorUnits: number, currency: CurrencyCode = "NGN", options: FormatOptions = {}) {
  const minorUnitsPerUnit = MINOR_UNITS_BY_CURRENCY[currency] ?? 2;
  const value = minorUnits / 10 ** minorUnitsPerUnit;
  const isWhole = Number.isInteger(value);

  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: options.compact && isWhole ? 0 : minorUnitsPerUnit,
    maximumFractionDigits: options.compact && isWhole ? 0 : minorUnitsPerUnit,
  }).format(value);
}

/**
 * "Was X, now Y" badge maths. Returns 0 when there is no genuine saving so the
 * UI never renders a "-0%" pill.
 */
export function discountPercent(originalMinorUnits: number | null | undefined, currentMinorUnits: number) {
  if (!originalMinorUnits || originalMinorUnits <= currentMinorUnits) return 0;
  return Math.round(((originalMinorUnits - currentMinorUnits) / originalMinorUnits) * 100);
}

export function savings(originalMinorUnits: number | null | undefined, currentMinorUnits: number) {
  if (!originalMinorUnits || originalMinorUnits <= currentMinorUnits) return 0;
  return originalMinorUnits - currentMinorUnits;
}

