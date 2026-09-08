// P2 — create the Stripe Products and Prices for our current pricing, from our own tables.
//
// Pressed by a super_admin from the admin pricing editor ("Sync prices to Stripe"), and by
// nobody else. All of the arithmetic and all of the decision-making lives in
// _shared/stripe-price-sync.ts, which is unit-tested against the seeded prices; this file is the
// adapter layer — authorise the caller, read the pricing tables, hand Stripe and Postgres to the
// shared function, report what changed.
//
// NO `verify_jwt = false` ENTRY IN config.toml, deliberately. Most functions here are webhooks or
// public endpoints and have to opt out of Supabase's JWT check. This one is the opposite: it
// creates objects that decide what customers are charged, so it keeps the platform's own
// verification AND does its own super_admin check on top.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildPricingConfig } from "../_shared/pricing-calc.ts";
import {
  desiredPrices,
  planSync,
  syncPrices,
  type ExistingPrice,
  type PriceStore,
  type ProductKey,
  type StripePriceApi,
} from "../_shared/stripe-price-sync.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── who is asking ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claimsData, error: claimsError } = await asCaller.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub;
    const { data: staffRow, error: staffError } = await asCaller
      .from("staff")
      .select("id, role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (staffError || staffRow?.role !== "super_admin") {
      return json({ error: "Forbidden — super admin access required" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── what our tables say the prices are ─────────────────────────────────
    const [{ data: planRows, error: planErr }, { data: settingRows, error: settingErr }] =
      await Promise.all([
        admin.from("pricing_plans").select("plan_key, monthly_net, annual_months, subscription_tax_rate, is_active"),
        admin.from("pricing_settings").select("key, value"),
      ]);

    if (planErr || settingErr) {
      console.error("stripe-sync-prices: cannot read pricing tables", planErr, settingErr);
      return json({ error: "Could not read the pricing tables" }, 500);
    }

    // No fallback argument: buildPricingConfig is STRICT in this mode and throws on a missing
    // plan or setting rather than substituting a hardcoded price. A half-configured table must
    // not become a Price in Stripe.
    const config = buildPricingConfig(
      (planRows ?? []).filter((p: { is_active?: boolean | null }) => p.is_active !== false),
      settingRows ?? [],
    );

    const desired = desiredPrices(config);

    // ── a dry run reports without creating anything ────────────────────────
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { data: currentRows } = await admin
      .from("stripe_prices")
      .select("price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval")
      .eq("is_current", true);
    const current = (currentRows ?? []) as ExistingPrice[];

    if (body?.dryRun === true) {
      return json({
        dryRun: true,
        changes: planSync(desired, current).map((c) => ({
          priceKey: c.desired.priceKey,
          action: c.action,
          amountCents: c.desired.amountCents,
          reason: c.reason,
        })),
      });
    }

    // ── the Stripe key ─────────────────────────────────────────────────────
    const { data: keyRow } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .maybeSingle();

    if (!keyRow?.value) {
      return json(
        { error: "Stripe is not configured — settings_stripe_secret_key is empty", code: "STRIPE_NOT_CONFIGURED" },
        503,
      );
    }

    const stripeSdk = new Stripe(keyRow.value, { apiVersion: "2023-10-16" });

    const stripe: StripePriceApi = {
      createProduct: async (name) => {
        const p = await stripeSdk.products.create({ name });
        return { id: p.id };
      },
      createPrice: async ({ productId, unitAmountCents, recurringInterval }) => {
        const p = await stripeSdk.prices.create({
          product: productId,
          currency: "eur",
          unit_amount: unitAmountCents,
          ...(recurringInterval ? { recurring: { interval: recurringInterval } } : {}),
        });
        return { id: p.id };
      },
    };

    const store: PriceStore = {
      listCurrent: async () => current,
      findProductId: async (productKey: ProductKey) => {
        // Any row ever recorded for a price of this product group carries its Product id, so a
        // re-created key reuses the Product instead of making a second one with the same name.
        const keys =
          productKey === "plan_single"
            ? ["plan_single_monthly", "plan_single_annual"]
            : productKey === "plan_couple"
              ? ["plan_couple_monthly", "plan_couple_annual"]
              : [productKey];
        const { data } = await admin
          .from("stripe_prices")
          .select("stripe_product_id")
          .in("price_key", keys)
          .order("synced_at", { ascending: false })
          .limit(1);
        return data?.[0]?.stripe_product_id ?? null;
      },
      supersede: async (priceKey) => {
        const { error } = await admin
          .from("stripe_prices")
          .update({ is_current: false })
          .eq("price_key", priceKey)
          .eq("is_current", true);
        if (error) throw new Error(`could not supersede ${priceKey}: ${error.message}`);
      },
      insert: async (row) => {
        const { error } = await admin.from("stripe_prices").insert(row);
        if (error) throw new Error(`could not record ${row.price_key}: ${error.message}`);
      },
    };

    const result = await syncPrices({ config, stripe, store, syncedBy: staffRow.id });

    console.log(
      `stripe-sync-prices: created=${result.created.length} repriced=${result.repriced.length} ` +
        `unchanged=${result.unchanged.length}`,
    );

    return json({ success: true, ...result });
  } catch (error) {
    // The message can name a Stripe or pricing problem, both of which the admin needs to see;
    // it carries no member data and no credential.
    console.error("stripe-sync-prices error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
