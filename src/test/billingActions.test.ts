import { describe, it, expect, vi } from "vitest";
import {
  performSubscriptionAction,
  isMollieGateway,
  ACTION_TO_DB_STATUS,
  type StripeSubscriptionsApi,
  type SubscriptionUpdateClient,
} from "../../supabase/functions/_shared/billing";

function makeStripe(opts?: { throwOn?: boolean }) {
  const cancel = vi.fn(async (_id: string) => {
    if (opts?.throwOn) throw new Error("card_declined");
    return { id: _id, status: "canceled" };
  });
  const update = vi.fn(async (_id: string, _params: Record<string, unknown>) => {
    if (opts?.throwOn) throw new Error("api_error");
    return { id: _id };
  });
  const stripe: StripeSubscriptionsApi = { subscriptions: { cancel, update } };
  return { stripe, cancel, update };
}

function makeDb(opts?: { error?: unknown }) {
  const eq = vi.fn(async () => ({ error: opts?.error ?? null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const db: SubscriptionUpdateClient = { from };
  return { db, from, update, eq };
}

const BASE = {
  subscriptionId: "sub-row-1",
  stripeSubscriptionId: "sub_stripe_1",
};

describe("isMollieGateway", () => {
  it("true only when explicitly mollie", () => {
    expect(isMollieGateway("mollie")).toBe(true);
    expect(isMollieGateway("Mollie")).toBe(true);
    expect(isMollieGateway("stripe")).toBe(false);
    expect(isMollieGateway(null)).toBe(false);
    expect(isMollieGateway(undefined)).toBe(false);
    expect(isMollieGateway("")).toBe(false);
  });
});

describe("performSubscriptionAction — Stripe drives, DB follows", () => {
  it("cancel calls Stripe.cancel then flips DB to cancelled", async () => {
    const { stripe, cancel } = makeStripe();
    const { db, update, eq } = makeDb();
    const r = await performSubscriptionAction({ stripe, db, gateway: "stripe", action: "cancel", ...BASE });
    expect(cancel).toHaveBeenCalledWith("sub_stripe_1");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(eq).toHaveBeenCalledWith("id", "sub-row-1");
    expect(r.ok).toBe(true);
    expect(r.dbStatus).toBe(ACTION_TO_DB_STATUS.cancel);
  });

  it("pause uses pause_collection void then flips DB to suspended", async () => {
    const { stripe, update: stripeUpdate } = makeStripe();
    const { db, update } = makeDb();
    const r = await performSubscriptionAction({ stripe, db, gateway: "stripe", action: "pause", ...BASE });
    expect(stripeUpdate).toHaveBeenCalledWith("sub_stripe_1", { pause_collection: { behavior: "void" } });
    expect(update).toHaveBeenCalledWith({ status: "paused" });
    expect(r.ok).toBe(true);
  });

  it("resume clears pause_collection then flips DB to active", async () => {
    const { stripe, update: stripeUpdate } = makeStripe();
    const { db, update } = makeDb();
    const r = await performSubscriptionAction({ stripe, db, gateway: "stripe", action: "resume", ...BASE });
    expect(stripeUpdate).toHaveBeenCalledWith("sub_stripe_1", { pause_collection: null });
    expect(update).toHaveBeenCalledWith({ status: "active" });
    expect(r.ok).toBe(true);
  });
});

describe("performSubscriptionAction — DB is NOT changed when Stripe fails", () => {
  it("does not touch the DB if Stripe throws", async () => {
    const { stripe } = makeStripe({ throwOn: true });
    const { db, from } = makeDb();
    const r = await performSubscriptionAction({ stripe, db, gateway: "stripe", action: "cancel", ...BASE });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(from).not.toHaveBeenCalled(); // DB never touched
  });

  it("422 (no DB, no Stripe) when subscription has no stripe id", async () => {
    const { stripe, cancel } = makeStripe();
    const { db, from } = makeDb();
    const r = await performSubscriptionAction({
      stripe, db, gateway: "stripe", action: "cancel",
      subscriptionId: "sub-row-1", stripeSubscriptionId: null,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(cancel).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces a reconcile error if Stripe succeeds but DB update fails", async () => {
    const { stripe } = makeStripe();
    const { db } = makeDb({ error: { message: "db down" } });
    const r = await performSubscriptionAction({ stripe, db, gateway: "stripe", action: "cancel", ...BASE });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.reason).toMatch(/RECONCILE/);
  });
});

describe("performSubscriptionAction — Mollie is blocked, not silently no-op'd", () => {
  it("blocks with 501 and touches NEITHER Stripe NOR the DB", async () => {
    const { stripe, cancel, update: stripeUpdate } = makeStripe();
    const { db, from } = makeDb();
    const r = await performSubscriptionAction({ stripe, db, gateway: "mollie", action: "cancel", ...BASE });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(501);
    expect(r.reason).toMatch(/Mollie/i);
    expect(cancel).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
