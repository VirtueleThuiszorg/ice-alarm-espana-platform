import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE WEBHOOK'S SOURCE — both files, in the order they used to be one.
 *
 * `stripe-webhook/index.ts` was split: the transport (signature check, the `webhook_events`
 * claim-and-stamp, `serve()`) stayed, and every handler moved to
 * `_shared/stripe-webhook-handlers.ts` so it could be RUN rather than only read
 * (`src/test/stripeWebhookExecuted.test.ts`).
 *
 * Five test files scan that source for the shape of things the money path must and must not
 * contain. Concatenated TRANSPORT FIRST, because that is exactly the order the single file had —
 * so `indexOf(a) < indexOf(b)` assertions mean what they meant before the split, rather than
 * accidentally passing or failing on which file a string landed in.
 *
 * One definition, imported by all five, so a future move has one place to update instead of
 * five that drift.
 */
export const WEBHOOK_FILES = [
  "supabase/functions/stripe-webhook/index.ts",
  "supabase/functions/_shared/stripe-webhook-handlers.ts",
] as const;

/** Raw, unstripped. Each caller strips comments its own way; that is left alone. */
export function webhookSource(): string {
  return WEBHOOK_FILES.map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
}

