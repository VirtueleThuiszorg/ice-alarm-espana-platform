/**
 * The pricing inputs a checkout needs, loaded from OUR tables — the one place that reads them.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE. `_shared/checkout-lines.ts` is deliberately pure: it takes
 * a `PricingConfig` and a list of synced Prices as arguments so its refusals can be tested
 * without a database. Something still has to fetch those arguments, and until now that
 * something was thirty lines inlined in `send-payment-link` — which meant `create-checkout`
 * adopting the same price-id logic would have had to either import an edge function or copy the
 * fetch. Lee's instruction was explicit: "one implementation, not two". This is the fetch,
 * extracted, so both functions load the same rows in the same order and get the same refusals.
 *
 * WHAT IT REFUSES. `buildPricingConfig` is called WITHOUT a fallback, so a missing plan row or
 * a missing setting throws instead of quietly substituting a literal. That is the right
 * behaviour for money: a charge computed from baked-in numbers is a charge nobody can
 * reconcile against the admin screens. The caller turns that into a 503 with
 * `PRICING_NOT_CONFIGURED`, never into a guess.
 *
 * The registration fee's two switches live in `system_settings`, not `pricing_settings`, and
 * the canonical keys are the ones the money path reads (P5, 20260908120000). Getting that wrong
 * silently charges or omits a fee, so the keys are named here once rather than at each caller.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { buildPricingConfig, type PricingConfig } from "./pricing-calc.ts";
import type { ExistingPrice } from "./stripe-price-sync.ts";

/** Thrown when our own tables cannot answer "what does this cost?". Never a fallback. */
export class PricingNotConfiguredError extends Error {
  readonly code = "PRICING_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "PricingNotConfiguredError";
  }
}

/** The `system_settings` keys the money path reads. Named once, spelled once. */
/*
  Named for the fee, and it has outgrown that: the delivery channel switches are here too,
  because the caller reads them in the same breath and a second round trip for two booleans is
  two round trips. Widening the name would touch every caller for no gain; widening the comment
  is the honest fix.
*/
export const FEE_SETTING_KEYS = [
  "registration_fee_enabled",
  "registration_fee_discount",
  "notify_channel_sms",
  "notify_channel_whatsapp",
] as const;

export interface PricingInputs {
  config: PricingConfig;
  /** Only `is_current` rows — history would let a stale Price win a `Map` build. */
  prices: ExistingPrice[];
  /**
   * Absent means ENABLED. The setting is written as the string "false" to switch the fee off,
   * and a missing row must not silently stop charging a fee the price list still advertises.
   */
  registrationFeeEnabled: boolean;
  /** Percentage, 0-100. Never from a request body. */
  registrationFeeDiscount: number;
  /** Raw `system_settings` values for the keys above, for callers that need the others. */
  setting: (key: (typeof FEE_SETTING_KEYS)[number]) => string | null;
}

/**
 * Read `pricing_plans`, `pricing_settings`, `stripe_prices` and the fee switches.
 *
 * The three pricing reads go out together because they are independent and this sits in front
 * of a customer pressing a Pay button; the fee switches follow because `buildPricingConfig` may
 * throw first and there is no point fetching settings for a charge we are about to refuse.
 */
export async function loadPricingInputs(db: SupabaseClient): Promise<PricingInputs> {
  const [{ data: plans }, { data: settings }, { data: prices }] = await Promise.all([
    db.from("pricing_plans").select("plan_key, monthly_net, annual_months, subscription_tax_rate"),
    db.from("pricing_settings").select("key, value"),
    db
      .from("stripe_prices")
      .select("price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval")
      .eq("is_current", true),
  ]);

  let config: PricingConfig;
  try {
    // No fallback argument, deliberately — see the header.
    config = buildPricingConfig(
      plans ?? [],
      (settings ?? []) as Array<{ key: string; value: number }>,
    );
  } catch (e) {
    throw new PricingNotConfiguredError(
      e instanceof Error ? e.message : "Pricing is not configured",
    );
  }

  const { data: feeSettings } = await db
    .from("system_settings")
    .select("key, value")
    .in("key", FEE_SETTING_KEYS as unknown as string[]);

  const setting = (key: (typeof FEE_SETTING_KEYS)[number]): string | null =>
    (feeSettings as Array<{ key: string; value: string | null }> | null)?.find(
      (r) => r.key === key,
    )?.value ?? null;

  return {
    config,
    prices: (prices ?? []) as ExistingPrice[],
    registrationFeeEnabled: setting("registration_fee_enabled") !== "false",
    registrationFeeDiscount: Number(setting("registration_fee_discount") ?? 0) || 0,
    setting,
  };
}
