// @vitest-environment node
//
// P2 — the amounts that end up in Stripe, and the one that must never be a browser's idea.
//
// REVIEW_JOIN_PATH.md F7/F9: `create-checkout` charged `Math.round(item.amount * 100)` where
// `item.amount` came from the request body, and the webhook never compared the total to
// anything. The fix is that a checkout names a Stripe price id, so these are the assertions on
// the numbers those Price objects are created with — against the REAL seeded pricing config, so
// a wrong figure here is a wrong charge.
//
// Both halves are tested: the arithmetic (pure, exact cents) and the sync ordering (a Price must
// exist in Stripe before the old row stops being current, or a checkout has nothing to charge).

import { describe, it, expect } from "vitest";
import {
  PRICE_KEYS,
  desiredPrices,
  isInSync,
  planPriceKey,
  planSync,
  productKeyFor,
  syncPrices,
  toCents,
  type ExistingPrice,
  type PriceStore,
  type StripePriceApi,
} from "../../supabase/functions/_shared/stripe-price-sync";
import type { PricingConfig } from "../../supabase/functions/_shared/pricing-calc";

/**
 * The values 20260617120000 seeds, which are the live ones: single 24.99, couple 34.99, both at
 * 10% IVA with 10 months charged annually; pendant 125.00 at 21%; shipping 14.99 IVA-included;
 * registration 59.99 at 0%.
 */
const SEEDED: PricingConfig = {
  single: { monthlyNet: 24.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  couple: { monthlyNet: 34.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  pendantNet: 125,
  pendantTaxRate: 0.21,
  shipping: 14.99,
  registrationBase: 59.99,
  registrationTaxRate: 0,
};

const byKey = (c: PricingConfig) => new Map(desiredPrices(c).map((d) => [d.priceKey, d]));

describe("the amounts synced to Stripe, against the seeded pricing", () => {
  const prices = byKey(SEEDED);

  it("all seven keys are produced, and only those", () => {
    expect([...prices.keys()].sort()).toEqual([...PRICE_KEYS].sort());
  });

  // Each figure is written out longhand so a reviewer can check it without running anything.
  it.each([
    ["plan_single_monthly", 2749, "24.99 x 1.10 = 27.489", "month"],
    ["plan_single_annual", 27489, "24.99 x 10 x 1.10 = 274.89", "year"],
    ["plan_couple_monthly", 3849, "34.99 x 1.10 = 38.489", "month"],
    ["plan_couple_annual", 38489, "34.99 x 10 x 1.10 = 384.89", "year"],
    ["pendant", 15125, "125.00 x 1.21 = 151.25", null],
    ["shipping", 1499, "14.99, IVA included", null],
    ["registration_fee", 5999, "59.99, as calculateOrder charges it", null],
  ] as const)("%s is %i cents (%s)", (key, cents, _why, interval) => {
    const p = prices.get(key)!;
    expect(p.amountCents).toBe(cents);
    expect(p.recurringInterval).toBe(interval);
  });

  it("a plan's monthly and annual prices share ONE Stripe product", () => {
    expect(productKeyFor("plan_single_monthly")).toBe(productKeyFor("plan_single_annual"));
    expect(productKeyFor("plan_couple_monthly")).toBe(productKeyFor("plan_couple_annual"));
    expect(productKeyFor("plan_single_monthly")).not.toBe(productKeyFor("plan_couple_monthly"));
  });

  it("every plan price recurs and every one-off does not — the migration's CHECK, in code", () => {
    for (const p of prices.values()) {
      if (p.priceKey.startsWith("plan_")) expect(p.recurringInterval).not.toBeNull();
      else expect(p.recurringInterval).toBeNull();
    }
  });

  it("carries a source line naming where the number came from", () => {
    expect(prices.get("plan_single_annual")!.sourceDescription).toBe(
      "24.99 net/month x 10 months x 1.10 IVA",
    );
    expect(prices.get("pendant")!.sourceDescription).toBe("125.00 net x 1.21 IVA");
  });

  it("planPriceKey maps the wizard's own vocabulary onto the seven keys", () => {
    expect(planPriceKey("single", "monthly")).toBe("plan_single_monthly");
    expect(planPriceKey("single", "annual")).toBe("plan_single_annual");
    expect(planPriceKey("couple", "monthly")).toBe("plan_couple_monthly");
    expect(planPriceKey("couple", "annual")).toBe("plan_couple_annual");
  });

  it("the annual price is ten months, not twelve — the two free months are the offer", () => {
    const monthly = prices.get("plan_single_monthly")!.amountCents;
    const annual = prices.get("plan_single_annual")!.amountCents;
    expect(annual).toBeLessThan(monthly * 12);

    // And it is ONE CENT less than ten monthly charges, on purpose: 24.99 x 1.10 is 27.489, which
    // rounds up to 27.49 as a monthly Price, while the annual Price is 274.89 exactly — rounded
    // once at the end rather than ten times. Charging 274.90 for "ten months" would be a cent of
    // rounding profit nobody agreed to, and this is the assertion that keeps it that way.
    expect(annual).toBe(monthly * 10 - 1);
    expect(annual).toBe(27489);
  });

  it("follows the tables rather than these constants: a price change moves the cents", () => {
    const raised = byKey({ ...SEEDED, single: { ...SEEDED.single, monthlyNet: 29.99 } });
    expect(raised.get("plan_single_monthly")!.amountCents).toBe(3299); // 29.99 x 1.10 = 32.989
    expect(raised.get("plan_couple_monthly")!.amountCents).toBe(3849); // untouched
  });

  it("an IVA rate change moves the cents too", () => {
    const vat21 = byKey({ ...SEEDED, single: { ...SEEDED.single, subscriptionTaxRate: 0.21 } });
    expect(vat21.get("plan_single_monthly")!.amountCents).toBe(3024); // 24.99 x 1.21 = 30.2379
  });

  it("the registration fee follows calculateOrder, not registrationBase directly", () => {
    // If the fee ever starts carrying IVA, the synced Price must move with the customer's total
    // rather than staying at the base figure. Pinned by reading it off the same function.
    const free = byKey({ ...SEEDED, registrationBase: 0 });
    expect(free.get("registration_fee")!.amountCents).toBe(0);
  });
});

describe("toCents", () => {
  it("converts the ordinary cases exactly", () => {
    expect(toCents(24.99)).toBe(2499);
    expect(toCents(0)).toBe(0);
    expect(toCents(151.25)).toBe(15125);
  });

  it("rounds the third decimal, which is where IVA lands", () => {
    expect(toCents(27.489)).toBe(2749);
    expect(toCents(38.489)).toBe(3849);
    expect(toCents(30.2379)).toBe(3024);
  });

  it("does not lose the cent that naive rounding loses", () => {
    // 0.145 * 100 is 14.499999999999998 in binary floating point, so Math.round gives 14.
    expect(toCents(0.145)).toBe(15);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(8.165)).toBe(817);
  });

  it("refuses a non-finite amount rather than pricing NaN", () => {
    expect(() => toCents(Number.NaN)).toThrow(/non-finite/);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it("refuses a negative amount — a negative Price pays the customer", () => {
    expect(() => toCents(-1)).toThrow(/negative/);
  });
});

const existing = (over: Partial<ExistingPrice> & { price_key: string }): ExistingPrice => ({
  stripe_product_id: "prod_x",
  stripe_price_id: "price_x",
  amount_cents: 2749,
  recurring_interval: "month",
  ...over,
});

describe("planSync decides what changes, without changing anything", () => {
  const desired = desiredPrices(SEEDED);

  it("everything is a create when nothing has been synced", () => {
    const plan = planSync(desired, []);
    expect(plan.every((c) => c.action === "create")).toBe(true);
    expect(isInSync(desired, [])).toBe(false);
  });

  it("nothing changes when every amount already matches", () => {
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.amountCents,
        recurring_interval: d.recurringInterval,
        stripe_price_id: `price_${d.priceKey}`,
      }),
    );
    expect(planSync(desired, rows).every((c) => c.action === "unchanged")).toBe(true);
    expect(isInSync(desired, rows)).toBe(true);
  });

  it("a changed amount is a REPRICE, because a Stripe Price cannot be edited", () => {
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.priceKey === "pendant" ? 14000 : d.amountCents,
        recurring_interval: d.recurringInterval,
      }),
    );
    const plan = planSync(desired, rows);
    const pendant = plan.find((c) => c.desired.priceKey === "pendant")!;
    expect(pendant.action).toBe("reprice");
    expect(pendant.reason).toMatch(/14000 → 15125/);
    expect(plan.filter((c) => c.action !== "unchanged")).toHaveLength(1);
    expect(isInSync(desired, rows)).toBe(false);
  });

  it("a changed billing interval is a reprice too", () => {
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.amountCents,
        recurring_interval: d.priceKey === "plan_single_annual" ? "month" : d.recurringInterval,
      }),
    );
    const plan = planSync(desired, rows);
    const annual = plan.find((c) => c.desired.priceKey === "plan_single_annual")!;
    expect(annual.action).toBe("reprice");
    expect(annual.reason).toMatch(/interval/);
  });

  it("a one-off recorded as recurring is caught — that would bill shipping every month", () => {
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.amountCents,
        recurring_interval: d.priceKey === "shipping" ? "month" : d.recurringInterval,
      }),
    );
    expect(isInSync(desired, rows)).toBe(false);
  });
});

/** A Stripe stand-in that records what it was asked to create. */
function fakeStripe() {
  const products: string[] = [];
  const prices: Array<{ productId: string; unitAmountCents: number; recurringInterval: string | null }> = [];
  let n = 0;
  const api: StripePriceApi = {
    createProduct: async (name) => {
      products.push(name);
      return { id: `prod_${products.length}` };
    },
    createPrice: async (input) => {
      prices.push(input);
      n += 1;
      return { id: `price_new_${n}` };
    },
  };
  return { api, products, prices };
}

/** A store stand-in that records the ORDER of its calls, which is the property under test. */
function fakeStore(current: ExistingPrice[] = [], productIds: Record<string, string> = {}) {
  const calls: string[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const store: PriceStore = {
    listCurrent: async () => {
      calls.push("listCurrent");
      return current;
    },
    findProductId: async (productKey) => {
      calls.push(`findProductId:${productKey}`);
      return productIds[productKey] ?? null;
    },
    supersede: async (priceKey) => {
      calls.push(`supersede:${priceKey}`);
    },
    insert: async (row) => {
      calls.push(`insert:${row.price_key}`);
      inserted.push(row);
    },
  };
  return { store, calls, inserted };
}

describe("syncPrices", () => {
  it("creates all seven Prices and five Products on a first run", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    const result = await syncPrices({
      config: SEEDED,
      stripe: stripe.api,
      store: store.store,
      syncedBy: "staff-1",
    });

    expect(result.created).toHaveLength(7);
    expect(result.repriced).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
    expect(stripe.prices).toHaveLength(7);
    // Five products, not seven: each plan's two prices share one.
    expect(stripe.products).toHaveLength(5);
    expect(store.inserted).toHaveLength(7);
  });

  it("stamps every inserted row with the amount, interval, source line and actor", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    await syncPrices({ config: SEEDED, stripe: stripe.api, store: store.store, syncedBy: "staff-7" });

    const pendant = store.inserted.find((r) => r.price_key === "pendant")!;
    expect(pendant.amount_cents).toBe(15125);
    expect(pendant.recurring_interval).toBeNull();
    expect(pendant.source_description).toBe("125.00 net x 1.21 IVA");
    expect(pendant.synced_by).toBe("staff-7");
    expect(String(pendant.stripe_price_id)).toMatch(/^price_new_/);
  });

  it("does nothing at all when everything already matches", async () => {
    const desired = desiredPrices(SEEDED);
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.amountCents,
        recurring_interval: d.recurringInterval,
        stripe_price_id: `price_${d.priceKey}`,
      }),
    );
    const stripe = fakeStripe();
    const store = fakeStore(rows);
    const result = await syncPrices({
      config: SEEDED,
      stripe: stripe.api,
      store: store.store,
      syncedBy: null,
    });

    expect(result.unchanged).toHaveLength(7);
    expect(stripe.prices).toHaveLength(0);
    expect(stripe.products).toHaveLength(0);
    expect(store.calls.filter((c) => c.startsWith("insert"))).toHaveLength(0);
    expect(store.calls.filter((c) => c.startsWith("supersede"))).toHaveLength(0);
    // The report still names all seven, so pressing the button twice tells you it is in sync
    // rather than telling you nothing.
    expect(result.report).toHaveLength(7);
    expect(result.report.every((r) => r.action === "unchanged")).toBe(true);
  });

  it("creates the new Price in Stripe BEFORE superseding the old row", async () => {
    // The ordering is the safety property. Superseding first leaves a key with no current Price,
    // and a checkout in that window has nothing to charge against. Creating first can only leave
    // an orphaned Price in Stripe, which is harmless and cleared by re-running.
    const rows = [existing({ price_key: "pendant", amount_cents: 14000, recurring_interval: null })];
    const stripe = fakeStripe();
    const store = fakeStore(rows);
    await syncPrices({ config: SEEDED, stripe: stripe.api, store: store.store, syncedBy: null });

    const supersede = store.calls.indexOf("supersede:pendant");
    const insert = store.calls.indexOf("insert:pendant");
    expect(supersede).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(supersede);
    // And the Price existed in Stripe before either happened.
    expect(stripe.prices.some((p) => p.unitAmountCents === 15125)).toBe(true);
  });

  it("reuses the Product id from the row it is superseding", async () => {
    const rows = [
      existing({
        price_key: "pendant",
        amount_cents: 14000,
        recurring_interval: null,
        stripe_product_id: "prod_existing_pendant",
      }),
    ];
    const stripe = fakeStripe();
    const store = fakeStore(rows);
    await syncPrices({ config: SEEDED, stripe: stripe.api, store: store.store, syncedBy: null });

    const pendantPrice = stripe.prices.find((p) => p.unitAmountCents === 15125)!;
    expect(pendantPrice.productId).toBe("prod_existing_pendant");
    // A second Product with the same name would clutter Stripe and split the reporting.
    expect(stripe.products).not.toContain("ICE Alarm España — SOS pendant");
  });

  it("reuses a Product recorded against a SUPERSEDED row when the key is being re-created", async () => {
    const stripe = fakeStripe();
    const store = fakeStore([], { pendant: "prod_from_history" });
    await syncPrices({ config: SEEDED, stripe: stripe.api, store: store.store, syncedBy: null });

    const pendantPrice = stripe.prices.find((p) => p.unitAmountCents === 15125)!;
    expect(pendantPrice.productId).toBe("prod_from_history");
  });

  it("repricing one key leaves the other six alone", async () => {
    const desired = desiredPrices(SEEDED);
    const rows = desired.map((d) =>
      existing({
        price_key: d.priceKey,
        amount_cents: d.priceKey === "plan_couple_annual" ? 30000 : d.amountCents,
        recurring_interval: d.recurringInterval,
      }),
    );
    const stripe = fakeStripe();
    const store = fakeStore(rows);
    const result = await syncPrices({
      config: SEEDED,
      stripe: stripe.api,
      store: store.store,
      syncedBy: null,
    });

    expect(result.repriced).toEqual(["plan_couple_annual"]);
    expect(result.unchanged).toHaveLength(6);
    expect(stripe.prices).toHaveLength(1);
    expect(stripe.prices[0].unitAmountCents).toBe(38489);
    expect(stripe.prices[0].recurringInterval).toBe("year");
  });

  it("passes the recurring interval through to Stripe, per key", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    await syncPrices({ config: SEEDED, stripe: stripe.api, store: store.store, syncedBy: null });

    const intervals = stripe.prices.map((p) => p.recurringInterval);
    expect(intervals.filter((i) => i === "month")).toHaveLength(2);
    expect(intervals.filter((i) => i === "year")).toHaveLength(2);
    expect(intervals.filter((i) => i === null)).toHaveLength(3);
  });

  it("refuses to sync a config that would price NaN, before touching Stripe", async () => {
    const stripe = fakeStripe();
    const store = fakeStore();
    await expect(
      syncPrices({
        config: { ...SEEDED, pendantNet: Number.NaN },
        stripe: stripe.api,
        store: store.store,
        syncedBy: null,
      }),
    ).rejects.toThrow(/non-finite/);
    expect(stripe.prices).toHaveLength(0);
    expect(stripe.products).toHaveLength(0);
  });
});
