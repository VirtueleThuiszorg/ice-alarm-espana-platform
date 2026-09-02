import { format } from "date-fns";

/**
 * Format a timestamp that the database says may be null.
 *
 * Almost every `created_at`, `received_at` and `paid_at` in this schema is
 * nullable, and the pages were all writing `format(new Date(row.created_at))`.
 * TypeScript flagged it once the generated types caught up with the schema, but
 * the real problem is what the browser does with it: `new Date(null)` is the
 * Unix epoch, so a missing timestamp renders as **1 January 1970** rather than
 * as missing. On a payments table or an alert log that is not a cosmetic bug —
 * it is a row that looks like a real, very old record.
 *
 * Returns the fallback for null, undefined, and anything Date cannot parse.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  pattern: string,
  fallback = "—",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : format(d, pattern);
}

/**
 * The same guard for the many places that need a real Date object rather than
 * a formatted string — sorting, comparisons, `date-fns` arithmetic.
 */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
