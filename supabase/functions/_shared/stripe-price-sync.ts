/**
 * P2 — the Stripe Products and Prices behind our prices, derived from OUR tables.
 *
 * WHAT THIS REPLACES. `create-checkout` built every line item from `price_data` with
 * `unit_amount: Math.round(item.amount * 100)`, where `item.amount` arrived from the browser
 * (REVIEW_JOIN_PATH.md F7) and nothing server-side ever checked it (F9). Once prices are Stripe
 * objects created from `pricing_plans` / `pricing_settings`, a checkout can name a price id
 * instead of an amount, and there is no number left for a client to tamper with.
 *
 * NO SECOND PRICING IMPLEMENTATION. Every amount here comes out of `pricing-calc.ts` — the same
 * functions the public pages and `submit-registration` use. That is deliberate: a sync that did
 * its own multiplication would be a third copy of the pricing rules, and the Price in Stripe
 * could then differ from the figure the customer was shown while both looked right in isolation.
 * The registration fee and shipping are read off `calculateOrder` for exactly that reason, even
 * though multiplying them out here would be shorter.
 *
 * Amounts are IVA-included (P6), matching the public pages: membership +10%, pendant +21%,
 * registration fee as `calculateOrder` computes it (today: no IVA, `registration_tax_rate` is
 * seeded 0.00 and that function does not apply it — flagged, not changed here).
 *
 * NOTHING IN THIS FILE TALKS TO STRIPE OR TO POSTGRES. Both are injected, so the whole thing
 * runs under vitest against real assertions rather than a deployed function nobody can test.
 */

import {
  calculateOrder,
  getPendantFinalPrice,
  getSubscriptionFinalPrice,
  type BillingFrequency,
  type MembershipType,
  type PricingConfig,
} from "./pricing-calc.ts";

export type StripePriceKey =
  | "plan_single_monthly"
  | "plan_single_annual"
  | "plan_couple_monthly"
  | "plan_couple_annual"
  | "pendant"
  | "shipping"
  | "registration_fee";

/** The seven keys, in the order a report reads best. Also the CHECK list in the migration. */
export const PRICE_KEYS: readonly StripePriceKey[] = [
  "plan_single_monthly",
  "plan_single_annual",
  "plan_couple_monthly",
  "plan_couple_annual",
  "pendant",
  "shipping",
  "registration_fee",
];

export function planPriceKey(type: MembershipType, freq: BillingFrequency): StripePriceKey {
  return `plan_${type}_${freq === "monthly" ? "monthly" : "annual"}` as StripePriceKey;
}

/**
 * Which Stripe Product a price belongs to. Five products, seven prices: a plan's monthly and
 * annual prices are two prices of ONE product, which is how Stripe expects a plan to look and
 * what makes the customer's invoice say "ICE Alarm single membership" either way.
 */
export type ProductKey = "plan_single" | "plan_couple" | "pendant" | "shipping" | "registration_fee";

export function productKeyFor(priceKey: StripePriceKey): ProductKey {
  switch (priceKey) {
    case "plan_single_monthly":
    case "plan_single_annual":
      return "plan_single";
    case "plan_couple_monthly":
    case "plan_couple_annual":
      return "plan_couple";
    default:
      return priceKey;
  }
}

const PRODUCT_NAMES: Record<ProductKey, string> = {
  plan_single: "ICE Alarm España — single membership",
  plan_couple: "ICE Alarm España — couple membership",
  pendant: "ICE Alarm España — SOS pendant",
  shipping: "ICE Alarm España — shipping",
  registration_fee: "ICE Alarm España — registration fee",
};

/**
 * Euros to cents.
 *
 * `Math.round(x * 100)` alone is wrong often enough to matter: floating point puts 0.145 * 100 at
 * 14.499999999999998, which rounds DOWN to 14 — a cent lost on a price nobody would think to
 * check. Fixing to four decimals first collapses the representation error before rounding.
 */
export function toCents(euros: number): number {
  if (!Number.isFinite(euros)) {
    throw new Error(`stripe-price-sync: refusing to price a non-finite amount (${euros})`);
  }
  if (euros < 0) {
    throw new Error(`stripe-price-sync: refusing to price a negative amount (${euros})`);
  }
  return Math.round(Number((euros * 100).toFixed(4)));
}

export interface DesiredPrice {
  priceKey: StripePriceKey;
  productKey: ProductKey;
  productName: string;
  amountCents: number;
  /** 'month' | 'year' for the four plan prices; null for the three one-offs. */
  recurringInterval: "month" | "year" | null;
  /** How the amount was derived, in words — stored on the row as an audit line. */
  sourceDescription: string;
}

/**
 * The seven prices our tables currently imply. Pure: same config in, same list out.
 */
export function desiredPrices(c: PricingConfig): DesiredPrice[] {
  // One call, with the fee at full price and a pendant included, so shipping and the fee are
  // whatever the charge path itself computes rather than whatever this file thinks they are.
  const order = calculateOrder(c, {
    membershipType: "single",
    billingFrequency: "monthly",
    includePendant: true,
    pendantCount: 1,
    includeShipping: true,
    registrationFeeEnabled: true,
    registrationFeeDiscount: 0,
  });

  const plan = (type: MembershipType, freq: BillingFrequency): DesiredPrice => {
    const months = freq === "annual" ? c[type].annualMonths : 1;
    const rate = c[type].subscriptionTaxRate;
    return {
      priceKey: planPriceKey(type, freq),
      productKey: productKeyFor(planPriceKey(type, freq)),
      productName: PRODUCT_NAMES[productKeyFor(planPriceKey(type, freq))],
      amountCents: toCents(getSubscriptionFinalPrice(c, type, freq)),
      recurringInterval: freq === "monthly" ? "month" : "year",
      sourceDescription:
        `${c[type].monthlyNet.toFixed(2)} net/month` +
        (months > 1 ? ` x ${months} months` : "") +
        ` x ${(1 + rate).toFixed(2)} IVA`,
    };
  };

  const oneOff = (
    priceKey: Extract<StripePriceKey, "pendant" | "shipping" | "registration_fee">,
    euros: number,
    sourceDescription: string,
  ): DesiredPrice => ({
    priceKey,
    productKey: productKeyFor(priceKey),
    productName: PRODUCT_NAMES[productKeyFor(priceKey)],
    amountCents: toCents(euros),
    recurringInterval: null,
    sourceDescription,
  });

  return [
    plan("single", "monthly"),
    plan("single", "annual"),
    plan("couple", "monthly"),
    plan("couple", "annual"),
    oneOff(
      "pendant",
      getPendantFinalPrice(c, 1),
      `${c.pendantNet.toFixed(2)} net x ${(1 + c.pendantTaxRate).toFixed(2)} IVA`,
    ),
    oneOff("shipping", order.shipping, `${c.shipping.toFixed(2)} IVA included`),
    // Deliberately the fee `calculateOrder` produces at 0% discount, not registrationBase read
    // straight off the config: if that function ever starts applying registration_tax_rate, the
    // synced Price follows it instead of silently disagreeing with the customer's total.
    oneOff(
      "registration_fee",
      order.registrationFee,
      `${c.registrationBase.toFixed(2)} base, as calculateOrder charges it`,
    ),
  ];
}

/** A `stripe_prices` row as the sync needs to see it. */
export interface ExistingPrice {
  price_key: string;
  stripe_product_id: string;
  stripe_price_id: string;
  amount_cents: number;
  recurring_interval: string | null;
}

export type SyncAction = "create" | "reprice" | "unchanged";

export interface PlannedChange {
  desired: DesiredPrice;
  action: SyncAction;
  /** The current row, when there is one. Its product id is reused; its Price is superseded. */
  existing?: ExistingPrice;
  /** Why this row is changing, for the report Lee reads after pressing the button. */
  reason: string;
}

/**
 * What would change, without changing anything.
 *
 * `reprice` rather than `update`, because a Stripe Price is IMMUTABLE: a changed amount means a
 * NEW Price object, the old row marked superseded, and any subscription already billing on the
 * old Price left alone until someone migrates it deliberately.
 */
export function planSync(desired: DesiredPrice[], existing: ExistingPrice[]): PlannedChange[] {
  const byKey = new Map(existing.map((e) => [e.price_key, e]));
  return desired.map((d) => {
    const current = byKey.get(d.priceKey);
    if (!current) {
      return { desired: d, action: "create", reason: "no Price synced for this key yet" };
    }
    if (current.amount_cents !== d.amountCents) {
      return {
        desired: d,
        action: "reprice",
        existing: current,
        reason:
          `amount changed ${current.amount_cents} → ${d.amountCents} cents ` +
          "(Stripe Prices are immutable, so this creates a new one)",
      };
    }
    if ((current.recurring_interval ?? null) !== d.recurringInterval) {
      return {
        desired: d,
        action: "reprice",
        existing: current,
        reason:
          `billing interval changed ${current.recurring_interval ?? "one-off"} → ` +
          `${d.recurringInterval ?? "one-off"}`,
      };
    }
    return { desired: d, action: "unchanged", existing: current, reason: "already in sync" };
  });
}

/** Is what Stripe holds still what our tables say? Read by the admin editor and by checkout. */
export function isInSync(desired: DesiredPrice[], existing: ExistingPrice[]): boolean {
  return planSync(desired, existing).every((c) => c.action === "unchanged");
}

// ── the side-effecting half, with both sides injected ──────────────────────

export interface StripePriceApi {
  createProduct(name: string): Promise<{ id: string }>;
  createPrice(input: {
    productId: string;
    unitAmountCents: number;
    recurringInterval: "month" | "year" | null;
  }): Promise<{ id: string }>;
}

export interface PriceStore {
  /** Current rows only (`is_current`). */
  listCurrent(): Promise<ExistingPrice[]>;
  /** Any row ever recorded for this product group, newest first — to reuse the Product id. */
  findProductId(productKey: ProductKey): Promise<string | null>;
  supersede(priceKey: string): Promise<void>;
  insert(row: {
    price_key: string;
    stripe_product_id: string;
    stripe_price_id: string;
    amount_cents: number;
    recurring_interval: "month" | "year" | null;
    source_description: string;
    synced_by: string | null;
  }): Promise<void>;
}

export interface SyncResult {
  created: string[];
  repriced: string[];
  unchanged: string[];
  /** One line per key, in PRICE_KEYS order — what Lee sees after pressing the button. */
  report: Array<{ priceKey: string; action: SyncAction; amountCents: number; reason: string; stripePriceId?: string }>;
}

/**
 * Create what is missing, reprice what moved, touch nothing that already matches.
 *
 * Ordering matters and is not arbitrary: the Price is created in Stripe FIRST, then the old row
 * is superseded, then the new row is inserted. If the process dies midway the worst case is an
 * orphaned Price in Stripe that nothing references — harmless, and re-running fixes it. Marking
 * the old row superseded first would leave the table with no current Price for a key, and a
 * checkout would then have nothing to charge against.
 */
export async function syncPrices(deps: {
  config: PricingConfig;
  stripe: StripePriceApi;
  store: PriceStore;
  syncedBy: string | null;
}): Promise<SyncResult> {
  const desired = desiredPrices(deps.config);
  const existing = await deps.store.listCurrent();
  const planned = planSync(desired, existing);

  const result: SyncResult = { created: [], repriced: [], unchanged: [], report: [] };
  // Products created in THIS run, so a plan's monthly and annual prices share one Product
  // instead of creating two with the same name.
  const productIds = new Map<ProductKey, string>();

  for (const change of planned) {
    const { desired: d } = change;

    if (change.action === "unchanged") {
      result.unchanged.push(d.priceKey);
      result.report.push({
        priceKey: d.priceKey,
        action: "unchanged",
        amountCents: d.amountCents,
        reason: change.reason,
        stripePriceId: change.existing?.stripe_price_id,
      });
      continue;
    }

    let productId = productIds.get(d.productKey)
      ?? change.existing?.stripe_product_id
      ?? (await deps.store.findProductId(d.productKey));

    if (!productId) {
      productId = (await deps.stripe.createProduct(d.productName)).id;
    }
    productIds.set(d.productKey, productId);

    const price = await deps.stripe.createPrice({
      productId,
      unitAmountCents: d.amountCents,
      recurringInterval: d.recurringInterval,
    });

    if (change.action === "reprice") {
      await deps.store.supersede(d.priceKey);
      result.repriced.push(d.priceKey);
    } else {
      result.created.push(d.priceKey);
    }

    await deps.store.insert({
      price_key: d.priceKey,
      stripe_product_id: productId,
      stripe_price_id: price.id,
      amount_cents: d.amountCents,
      recurring_interval: d.recurringInterval,
      source_description: d.sourceDescription,
      synced_by: deps.syncedBy,
    });

    result.report.push({
      priceKey: d.priceKey,
      action: change.action,
      amountCents: d.amountCents,
      reason: change.reason,
      stripePriceId: price.id,
    });
  }

  return result;
}
