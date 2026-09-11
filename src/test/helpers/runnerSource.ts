import { readFileSync } from "node:fs";
import { join } from "node:path";
export const RUNNER_FILES = [
  "supabase/functions/billing-migration-run/index.ts",
  "supabase/functions/_shared/billing-migration-run.ts",
] as const;

/**
 * THE RUNNER'S SOURCE — both files, in the order they used to be one.
 *
 * Split for the same reason and with the same care as the webhook: `index.ts` keeps who may call
 * it and `serve()`, and the whole run moved to `_shared/billing-migration-run.ts` so it could be
 * RUN (`src/test/billingMigrationRunExecuted.test.ts`). Transport first, so the ordering
 * assertions mean what they meant.
 */
export function runnerSource(): string {
  return RUNNER_FILES.map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
}
