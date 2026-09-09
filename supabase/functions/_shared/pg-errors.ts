/**
 * "IS THIS SCHEMA MISSING, OR IS SOMETHING WRONG?" — the two Postgres/PostgREST error shapes
 * that decide whether a caller may degrade or must fail.
 *
 * Its own module with NO remote imports, deliberately: `notify-staff-runtime.ts` imports the
 * Supabase client from `https://esm.sh/...`, which vitest's ESM loader cannot resolve — so a
 * decision left in there could only be tested by reading the source, and this one is far too
 * important for that.
 */

/** What PostgREST returns for an error, as much of it as any of this needs. */
export interface PostgrestErrorish {
  code?: string;
  message?: string;
}

/**
 * IS THIS "THE TABLE IS NOT THERE YET", or a real failure?
 *
 * IT MATTERS BECAUSE OF WHAT HAPPENED. `notify-admin` was migrated onto this router while
 * `20260909121500_notify_staff.sql` was still unapplied. `routes()` threw on the missing table,
 * `dispatchNotifications` propagated it, the function answered 500 — and every one of
 * notify-admin's TWELVE events stopped, INCLUDING THE FOUR THAT SAY THE SAFETY MACHINERY HAS
 * FAILED. Each caller wraps its call in a try/catch and logs, so the loss was silent: a dead
 * escalation runner, a rung of the SOS ladder that did not reach a human, a member with no
 * emergency contacts — none of them would have reached a phone, and nothing would have said so.
 *
 * So a missing table is treated as WHAT IT MEANS: no policy rows and no preference rows exist
 * yet. Both read as OFF, which is what the planner does with an absent row anyway — and the four
 * always-loud events bypass those two gates, so they still send. Every other error still throws,
 * because "the query was refused" and "the table is empty" must never look the same.
 *
 * PostgREST answers 42P01 from Postgres, or PGRST205 from its own schema cache when the table is
 * absent from the exposed schema. Both are checked, plus the message, because the cache's shape
 * has changed between PostgREST versions.
 */
export function isMissingRelation(error: PostgrestErrorish | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "");
}

/** The same question for a COLUMN: 42703, or PostgREST's own PGRST204. */
export function isMissingColumn(error: PostgrestErrorish | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}
