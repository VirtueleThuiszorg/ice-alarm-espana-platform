/**
 * Admin billing actions (shared, testable core).
 * ------------------------------------------------------------------
 * Subscription pause/resume/cancel must drive Stripe — the DB status must NEVER say
 * "cancelled" while Stripe keeps charging. So: call Stripe FIRST; only update the DB if
 * Stripe succeeds. If the active gateway is Mollie, fail safe with a clear message rather
 * than silently flipping the DB (Mollie billing actions are not implemented yet).
 *
 * Dependency-free (no Deno / no https imports) so the same logic runs in the edge function
 * and is unit-testable under vitest with mocked Stripe + Supabase clients.
 */

export type SubscriptionAction = "cancel" | "pause" | "resume";

/**
 * DB `subscriptions.status` each action maps to AFTER Stripe succeeds.
 * Matches the existing app vocabulary (subscription_status enum: active/cancelled/
 * expired/paused/suspended) — pause uses 'paused', as the admin UI already expects.
 */
export const ACTION_TO_DB_STATUS: Record<SubscriptionAction, string> = {
  cancel: "cancelled",
  pause: "paused",
  resume: "active",
};

/** Minimal Stripe surface this module uses (subset of the real SDK). */
export interface StripeSubscriptionsApi {
  subscriptions: {
    cancel(id: string): Promise<unknown>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
}

/** Minimal Supabase update surface. */
export interface SubscriptionUpdateClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

/** Block billing actions only when the active gateway is explicitly Mollie. */
export function isMollieGateway(gateway: string | null | undefined): boolean {
  return (gateway ?? "").trim().toLowerCase() === "mollie";
}

/** Perform the Stripe call for an action. Throws on Stripe error (caller handles). */
export function callStripeForAction(
  stripe: StripeSubscriptionsApi,
  action: SubscriptionAction,
  stripeSubscriptionId: string,
): Promise<unknown> {
  switch (action) {
    case "cancel":
      return stripe.subscriptions.cancel(stripeSubscriptionId);
    case "pause":
      return stripe.subscriptions.update(stripeSubscriptionId, {
        pause_collection: { behavior: "void" },
      });
    case "resume":
      return stripe.subscriptions.update(stripeSubscriptionId, {
        pause_collection: null,
      });
  }
}

export interface BillingActionResult {
  ok: boolean;
  status: number;
  reason?: string;
  dbStatus?: string;
}

export interface PerformArgs {
  stripe: StripeSubscriptionsApi;
  db: SubscriptionUpdateClient;
  gateway: string | null | undefined;
  action: SubscriptionAction;
  subscriptionId: string;
  stripeSubscriptionId: string | null | undefined;
}

/**
 * Order of operations (the whole point):
 *   1. If gateway is Mollie -> blocked, NO Stripe call, NO DB change.
 *   2. If no stripe_subscription_id -> 422, NO DB change.
 *   3. Call Stripe. If it throws -> 502, NO DB change.
 *   4. Only after Stripe succeeds -> update DB status.
 */
export async function performSubscriptionAction(
  args: PerformArgs,
): Promise<BillingActionResult> {
  const { stripe, db, gateway, action, subscriptionId, stripeSubscriptionId } = args;

  if (isMollieGateway(gateway)) {
    return {
      ok: false,
      status: 501,
      reason: "Mollie billing actions not implemented — refusing to change subscription status.",
    };
  }

  if (!stripeSubscriptionId) {
    return {
      ok: false,
      status: 422,
      reason: "Subscription has no stripe_subscription_id; cannot action in Stripe.",
    };
  }

  // 1) Stripe FIRST — DB is not touched if this throws.
  try {
    await callStripeForAction(stripe, action, stripeSubscriptionId);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      reason: `Stripe ${action} failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 2) DB only after Stripe succeeded.
  const dbStatus = ACTION_TO_DB_STATUS[action];
  const updates: Record<string, unknown> = { status: dbStatus };
  if (action === "cancel") {
    updates.cancelled_at = new Date().toISOString();
  }
  const { error } = await db
    .from("subscriptions")
    .update(updates)
    .eq("id", subscriptionId);

  if (error) {
    return {
      ok: false,
      status: 500,
      reason: `Stripe ${action} succeeded but the DB status update failed — RECONCILE MANUALLY (subscription ${subscriptionId}).`,
    };
  }

  return { ok: true, status: 200, dbStatus };
}
