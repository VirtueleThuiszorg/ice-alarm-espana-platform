/**
 * The app-side door to the platform's one courtesy-call schedule rule.
 *
 * It lives in `supabase/functions/_shared/courtesy-schedule.ts` because the edge functions run in
 * Deno and can only reach their own directory and `_shared`; `src/` is not on that path.
 * Re-exported here so every app file writes `@/lib/courtesySchedule` and there is still exactly
 * one implementation — the same arrangement this repo already uses for `phone`, `pricing-calc`,
 * `holiday-policy` and `legacy-plan`.
 *
 * See that file for why the rule clamps to the end of the month, and what the two copies of it
 * disagreed about before this existed.
 */
export {
  calculateNextCallDate,
  nextCallDateString,
  type CourtesyFrequency,
} from "../../supabase/functions/_shared/courtesy-schedule";
