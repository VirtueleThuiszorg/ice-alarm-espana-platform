/**
 * Guard: every `supabase.functions.invoke` call site that reports failure to a
 * user must report the SERVER's reason, not supabase-js's generic string.
 *
 * `functions.invoke` surfaces any non-2xx as "Edge Function returned a non-2xx
 * status code" and leaves the function's real JSON body unread on
 * `error.context`. A partner who tripped the password rule saw that generic
 * string; the server had said `password: Invalid` and nobody read it.
 *
 * `extractFunctionError` (src/lib/functionError.ts) reads the body, including the
 * `details` array that validation rejects use. This test enumerates every call
 * site and requires the helper wherever a failure reaches the UI, so the class is
 * fixed rather than the one instance.
 *
 * Files that genuinely have no user-facing error path are listed in
 * NO_USER_FACING_ERROR with a reason each. That list is the audit: adding to it is
 * a deliberate, reviewable act, not a silent exemption.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { stripComments } from "./helpers/stripComments";

const SRC = path.resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(p, "utf8");

/** Every .ts/.tsx under src/, excluding tests. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, "/");

/** Call sites that never surface a failure to a user. Each needs a reason. */
const NO_USER_FACING_ERROR: Record<string, string> = {
  "src/lib/functionError.ts": "the helper itself",
  "src/hooks/useAIAgentHealth.ts": "background health poll; result renders as a status dot, no error toast",
  "src/hooks/useTwilioDevice.ts": "device token refresh loop; failure degrades to no-calling, logged only",
  "src/utils/notifications.ts": "fire-and-forget notification dispatch; caller owns any messaging",
  "src/components/admin/dashboard/PaidSalesFeed.tsx": "read-only dashboard feed; empty state on failure",
  "src/hooks/useBillingReminders.ts": "scheduled reminder read; surfaces as empty list",
  "src/hooks/useScheduledContent.ts": "scheduled content read; surfaces as empty list",
  "src/hooks/usePublishedPosts.ts": "published-post reads; surface as empty lists",
  "src/hooks/useFailedActions.ts": "reads the failed-action queue for display",
  "src/lib/sosDrill.ts": "SOS drill tooling — deliberately untouched (G1 human gate)",
  "src/lib/notifyTransition.ts":
    "WP3's fulfilment dispatcher. Shows nothing DELIBERATELY: notify-fulfilment returns 200 " +
    "with a decision per channel even when every one is skipped, so there is nothing truthful " +
    "to tell a staff member here — and with all three channels off in production the only " +
    "honest message would be 'nothing was sent' on every transition. What was and was not " +
    "sent lives in member_notification_log. It also must not throw: a notification that " +
    "could not be sent must never undo a fulfilment state that was. FULFILMENT_MODEL.md §6-A.5",
  "src/hooks/useSOSConference.ts": "SOS conference path — deliberately untouched (G1 human gate)",
  "src/lib/alertResolution.ts": "SOS/alert resolution path — deliberately untouched (G1 human gate)",
  "src/components/call-centre/AlertDetailPanel.tsx": "SOS/alert path — deliberately untouched (G1 human gate)",
  "src/components/join/steps/JoinPaymentStep.tsx": "Stripe checkout path — deliberately untouched (human gate)",
  // SubscriptionTab was exempted as "Stripe subscription path — deliberately untouched (human
  // gate)". It no longer invokes anything: its client-side `updateStatus` — which wrote
  // subscriptions.status from the browser and called nothing in Stripe — is gone, and the
  // actions moved to `useMemberAction`, which surfaces the server's reason through
  // functionError. The stale-entry half of this suite is what noticed.
  "src/pages/admin/SubscriptionsPage.tsx": "Stripe subscription path — deliberately untouched (human gate)",
  "src/pages/LandingPage.tsx": "track-invite-view is explicitly fire-and-forget (.catch(console.warn)); no UI path",
  "src/hooks/useRegistrationDraft.ts": "draft autosave; returns {success:false} and logs — deliberately does not nag the user mid-form",
  "src/pages/admin/PartnersQAPage.tsx": "QA harness: renders raw error.message as the check's `details`, which is the point of the page",
  "src/components/partner/CareDashboard.tsx": "its `if (error) throw` are partner_invites DB inserts, not invoke; the invoke outcome is counted into sent/failed and reported",
};

// ── the audit ──────────────────────────────────────────────────────────────

const invokeSites = sourceFiles()
  .filter((f) => /functions\s*\.\s*invoke/.test(read(f)))
  .map(rel)
  .sort();

describe("functions.invoke error surfacing", () => {
  it("finds the call sites (the audit is not vacuous)", () => {
    expect(invokeSites.length).toBeGreaterThan(40);
  });

  it("every call site either uses the shared helper or is a documented exemption", () => {
    // Either entry point counts: `extractFunctionError` for a message, or
    // `functionError` for a pre-wrapped Error. Both read the server's body.
    const offenders = invokeSites.filter(
      (f) => !/\bfunctionError\b|extractFunctionError/.test(read(path.resolve(process.cwd(), f))) && !(f in NO_USER_FACING_ERROR)
    );

    expect(
      offenders,
      `these invoke a function and can show a failure, but never read the server's reason:\n  ` +
        offenders.join("\n  ") +
        `\nFix with extractFunctionError, or add to NO_USER_FACING_ERROR with a reason.`
    ).toEqual([]);
  });

  it("the exemption list contains no stale entries", () => {
    const stale = Object.keys(NO_USER_FACING_ERROR).filter((f) => !invokeSites.includes(f));
    expect(stale, `exempted but no longer invoke a function: ${stale.join(", ")}`).toEqual([]);
  });

  it("no call site still shows supabase-js's generic string to a user", () => {
    const leaking = invokeSites.filter(
      (f) =>
        // The helper names the string in its own docs, which is the point of it.
        f !== "src/lib/functionError.ts" &&
        // COMMENTS STRIPPED. This scan read raw source and therefore flagged
        // `src/hooks/useSendPaymentLink.ts`, whose comment EXPLAINS that invoke hides the real
        // message behind "non-2xx status code" — the ninth time this repo has caught an
        // assertion matching the prose about a defect instead of the defect. A file that quotes
        // the string in a comment while calling functionError is doing the right thing.
        /non-2xx status code/i.test(stripComments(read(path.resolve(process.cwd(), f))))
    );
    expect(leaking, `hardcodes the generic invoke error: ${leaking.join(", ")}`).toEqual([]);
  });
});

// ── the helper must surface validation detail ───────────────────────────────

describe("extractFunctionError surfaces validation detail", () => {
  it("reads the details array, which is where the field rule lives", () => {
    const src = read(path.resolve(process.cwd(), "src/lib/functionError.ts"));
    expect(src).toMatch(/details/);
  });

  it("documents why details matters", () => {
    const src = read(path.resolve(process.cwd(), "src/lib/functionError.ts"));
    expect(src).toMatch(/Invalid request data/);
  });
});
