/**
 * create-checkout contract tests — item 5a.
 *
 * WHAT THESE HOLD IN PLACE. `create-checkout` used to take `lineItems` with an `amount` per
 * line out of the request body and charge it (REVIEW_JOIN_PATH.md F7), with nothing server-side
 * comparing it to the order being paid (F9). A visitor who edited one number in the request
 * bought a membership for a cent and `stripe-webhook` activated them, because the money really
 * did arrive. CLAUDE.md lists webhook/checkout contract tests as a CI gate, and the E2E gate is
 * "checkout→activation".
 *
 * These drive the REAL modules the function is built from — `_shared/checkout-order.ts` and
 * `_shared/checkout-pricing.ts` — against a scripted Supabase double, and assert what they
 * refuse and what they compute. Not a regex over the source: the refusals themselves. The two
 * source-text assertions at the bottom cover the one thing execution cannot reach here, which
 * is the shape of the `stripe.checkout.sessions.create` call inside a `serve()` body.
 *
 * FIXTURES ARE DERIVED, NOT TYPED IN. The synced `stripe_prices` rows are built by calling the
 * real `desiredPrices()` on the real `buildPricingConfig()` output, and the expected total by
 * calling the real `calculateOrder()`. A hardcoded 62.85 would pass while the pricing tables
 * said something else, which is precisely the divergence the PRICE_STALE refusal exists for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Imported through NON-LITERAL specifiers so `tsc -p tsconfig.app.json` does not follow them
// into the Deno edge-function tree (which legitimately uses `Deno.env` and `npm:` specifiers).
// Vitest still resolves them at runtime; the shapes are asserted by the tests below.
const ORDER_MOD = "../../supabase/functions/_shared/checkout-order.ts";
const PRICING_MOD = "../../supabase/functions/_shared/checkout-pricing.ts";
const LINES_MOD = "../../supabase/functions/_shared/checkout-lines.ts";
const CALC_MOD = "../../supabase/functions/_shared/pricing-calc.ts";
const SYNC_MOD = "../../supabase/functions/_shared/stripe-price-sync.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { loadCheckoutContext, assertChargeMatchesOrder, checkoutMetadata, CheckoutContextError } =
  (await import(/* @vite-ignore */ ORDER_MOD)) as any;
const { loadPricingInputs, PricingNotConfiguredError } = (await import(
  /* @vite-ignore */ PRICING_MOD
)) as any;
const { resolveCheckoutLines, toStripeLineItems } = (await import(
  /* @vite-ignore */ LINES_MOD
)) as any;
const { buildPricingConfig, calculateOrder } = (await import(/* @vite-ignore */ CALC_MOD)) as any;
const { desiredPrices, toCents } = (await import(/* @vite-ignore */ SYNC_MOD)) as any;

type Row = Record<string, unknown>;

/**
 * A scripted Supabase double. Deliberately dumb: it applies the `eq`/`in` filters that were
 * attached to the fixture rows and answers `maybeSingle()` with the first match, or resolves
 * the builder itself to the whole match list. That means a query naming the wrong column, or
 * forgetting a filter, changes the answer — which is what makes these tests able to fail.
 */
function makeDb(tables: Record<string, Row[]>) {
  const seen: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    seen.push({ table, filters });

    const rows = () =>
      (tables[table] ?? []).filter((r) =>
        filters.every(([col, val]) =>
          Array.isArray(val) ? val.includes(r[col]) : r[col] === val,
        ),
      );

    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      in: (col: string, val: unknown[]) => {
        filters.push([col, val]);
        return api;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      // Makes the builder awaitable, as the real one is when no row-shaping call is chained.
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return api;
  };

  return { db: { from } as any, seen };
}

const MEMBER = "11111111-1111-1111-1111-111111111111";
const PARTNER = "22222222-2222-2222-2222-222222222222";
const ORDER = "33333333-3333-3333-3333-333333333333";
const PAYMENT = "44444444-4444-4444-4444-444444444444";
const SUB = "55555555-5555-5555-5555-555555555555";
const PARTNER_SUB = "66666666-6666-6666-6666-666666666666";

const PLANS = [
  { plan_key: "single", monthly_net: 24.9, annual_months: 10, subscription_tax_rate: 0.1 },
  { plan_key: "couple", monthly_net: 39.9, annual_months: 10, subscription_tax_rate: 0.1 },
];

const PRICING_SETTINGS = [
  { key: "pendant_net", value: 149 },
  { key: "pendant_tax_rate", value: 0.21 },
  { key: "shipping_amount", value: 9.95 },
  { key: "registration_base", value: 35 },
  { key: "registration_tax_rate", value: 0 },
];

const CONFIG = buildPricingConfig(PLANS, PRICING_SETTINGS);

/** The `stripe_prices` table as `stripe-sync-prices` would leave it: in step with the config. */
const SYNCED_PRICES = desiredPrices(CONFIG).map((d: any) => ({
  price_key: d.priceKey,
  stripe_product_id: `prod_${d.productKey}`,
  stripe_price_id: `price_${d.priceKey}`,
  amount_cents: d.amountCents,
  recurring_interval: d.recurringInterval,
  is_current: true,
}));

const FEE_SETTINGS = [
  { key: "registration_fee_enabled", value: "true" },
  { key: "registration_fee_discount", value: "0" },
  { key: "notify_channel_sms", value: "false" },
];

/** What the order row would say for a given selection, computed the way the server computes it. */
function expectedTotal(selection: {
  membershipType: "single" | "couple";
  billingFrequency: "monthly" | "annual";
  pendantCount: number;
}) {
  const order = calculateOrder(CONFIG, {
    membershipType: selection.membershipType,
    billingFrequency: selection.billingFrequency,
    includePendant: selection.pendantCount > 0,
    pendantCount: selection.pendantCount > 0 ? selection.pendantCount : undefined,
    includeShipping: selection.pendantCount > 0,
    registrationFeeEnabled: true,
    registrationFeeDiscount: 0,
  });
  return Number((order.grandTotal as number).toFixed(2));
}

/** A complete, chargeable single-member registration. Each test spoils one thing. */
function fixtures(
  overrides: {
    plan?: "single" | "couple";
    freq?: "monthly" | "annual";
    pendantCount?: number;
    order?: Row;
    payment?: Row;
    subscription?: Row;
    partnerSubscription?: Row;
    members?: Row[];
    orderItems?: Row[];
  } = {},
) {
  const plan = overrides.plan ?? "single";
  const freq = overrides.freq ?? "monthly";
  const pendantCount = overrides.pendantCount ?? 1;

  const members: Row[] = overrides.members ?? [
    { id: MEMBER, first_name: "Ana", last_name: "Ruiz", email: "ana@example.com" },
    ...(plan === "couple"
      ? [{ id: PARTNER, first_name: "Luis", last_name: "Ruiz", email: "luis@example.com" }]
      : []),
  ];

  return {
    orders: [
      {
        id: ORDER,
        order_number: "ICE-20260909-00007",
        member_id: MEMBER,
        total_amount: expectedTotal({ membershipType: plan, billingFrequency: freq, pendantCount }),
        status: "pending",
        ...overrides.order,
      },
    ],
    payments: [
      {
        id: PAYMENT,
        order_id: ORDER,
        member_id: MEMBER,
        subscription_id: SUB,
        status: "pending",
        ...overrides.payment,
      },
    ],
    subscriptions: [
      {
        id: SUB,
        member_id: MEMBER,
        plan_type: plan,
        billing_frequency: freq,
        has_pendant: pendantCount > 0,
        status: "pending",
        ...overrides.subscription,
      },
      ...(plan === "couple"
        ? [
            {
              id: PARTNER_SUB,
              member_id: PARTNER,
              plan_type: plan,
              billing_frequency: freq,
              has_pendant: pendantCount > 0,
              status: "pending",
              ...overrides.partnerSubscription,
            },
          ]
        : []),
    ],
    members,
    order_items:
      overrides.orderItems ??
      (pendantCount > 0 ? [{ order_id: ORDER, item_type: "pendant", quantity: pendantCount }] : []),
    pricing_plans: PLANS,
    pricing_settings: PRICING_SETTINGS,
    stripe_prices: SYNCED_PRICES,
    system_settings: FEE_SETTINGS,
  };
}

const IDS = { memberId: MEMBER, orderId: ORDER, paymentId: PAYMENT, subscriptionId: SUB };
const COUPLE_IDS = { ...IDS, partnerMemberId: PARTNER, partnerSubscriptionId: PARTNER_SUB };

/** Runs `loadCheckoutContext` and returns the refusal code, or "OK". */
async function refusalCode(tables: Record<string, Row[]>, ids: Record<string, unknown>) {
  const { db } = makeDb(tables);
  try {
    await loadCheckoutContext(db, ids);
    return "OK";
  } catch (e) {
    // `CheckoutContextError` arrives through a non-literal import, so it is `any` here and
    // `instanceof` cannot narrow `e`. The cast is to read `.code`, not to soften the check.
    if (e instanceof CheckoutContextError) return (e as { code: string }).code;
    throw e;
  }
}

describe("the happy path reads the plan from the database, not the request", () => {
  it("derives plan, frequency and pendant count from the rows", async () => {
    const { db } = makeDb(fixtures({ plan: "couple", freq: "annual", pendantCount: 2 }));
    const context = await loadCheckoutContext(db, COUPLE_IDS);

    expect(context.subscription.membershipType).toBe("couple");
    expect(context.subscription.billingFrequency).toBe("annual");
    expect(context.pendantCount).toBe(2);
    expect(context.partner).toEqual({ memberId: PARTNER, subscriptionId: PARTNER_SUB });
    expect(context.member.email).toBe("ana@example.com");
    expect(context.order.orderNumber).toBe("ICE-20260909-00007");
  });

  it("charges the synced Price ids, and the total matches the order row", async () => {
    const tables = fixtures({ pendantCount: 1 });
    const { db } = makeDb(tables);
    const context = await loadCheckoutContext(db, IDS);
    const pricing = await loadPricingInputs(db);

    const resolved = resolveCheckoutLines(
      {
        membershipType: context.subscription.membershipType,
        billingFrequency: context.subscription.billingFrequency,
        pendantCount: context.pendantCount,
        includeShipping: context.pendantCount > 0,
        registrationFeeEnabled: pricing.registrationFeeEnabled,
        registrationFeeDiscount: pricing.registrationFeeDiscount,
      },
      pricing.prices,
      pricing.config,
    );

    // Every line is a synced Price id — no `price_data`, so no amount from anywhere else.
    const items = toStripeLineItems(resolved.lines);
    expect(items.every((i: any) => typeof i.price === "string")).toBe(true);
    expect(items.some((i: any) => "price_data" in i)).toBe(false);

    // Membership, pendant, shipping, registration fee.
    expect(resolved.lines.map((l: any) => l.priceKey)).toEqual([
      "plan_single_monthly",
      "pendant",
      "shipping",
      "registration_fee",
    ]);

    // Shipping is on the charge. It was MISSING from `submit-registration`'s lineItems while
    // being inside the order total, so Stripe collected less than the order said was due.
    expect(items.find((i: any) => i.price === "price_shipping")).toBeTruthy();

    // And the charge equals the order the customer was shown.
    expect(resolved.totalCents).toBe(toCents(context.order.totalAmount));
    expect(() => assertChargeMatchesOrder(resolved.totalCents, context.order.totalAmount)).not.toThrow();
  });

  it("a couple is ONE recurring line, pendant quantity 2, shipping once", async () => {
    const tables = fixtures({ plan: "couple", freq: "monthly", pendantCount: 2 });
    const { db } = makeDb(tables);
    const context = await loadCheckoutContext(db, COUPLE_IDS);
    const pricing = await loadPricingInputs(db);

    const resolved = resolveCheckoutLines(
      {
        membershipType: context.subscription.membershipType,
        billingFrequency: context.subscription.billingFrequency,
        pendantCount: context.pendantCount,
        includeShipping: context.pendantCount > 0,
        registrationFeeEnabled: pricing.registrationFeeEnabled,
        registrationFeeDiscount: pricing.registrationFeeDiscount,
      },
      pricing.prices,
      pricing.config,
    );

    const recurring = resolved.lines.filter((l: any) => l.recurringInterval !== null);
    expect(recurring).toHaveLength(1);
    expect(recurring[0].priceKey).toBe("plan_couple_monthly");
    expect(recurring[0].quantity).toBe(1);

    expect(resolved.lines.find((l: any) => l.priceKey === "pendant").quantity).toBe(2);
    expect(resolved.lines.find((l: any) => l.priceKey === "shipping").quantity).toBe(1);
  });

  it("stamps only server-derived ids into metadata", async () => {
    const { db } = makeDb(fixtures({ plan: "couple", pendantCount: 2 }));
    const metadata = checkoutMetadata(await loadCheckoutContext(db, COUPLE_IDS));

    expect(metadata).toEqual({
      member_id: MEMBER,
      order_id: ORDER,
      payment_id: PAYMENT,
      subscription_id: SUB,
      partner_member_id: PARTNER,
      partner_subscription_id: PARTNER_SUB,
      order_number: "ICE-20260909-00007",
      source: "join-wizard",
    });
  });

  it("leaves the couple keys empty for a single, rather than omitting them", async () => {
    const { db } = makeDb(fixtures());
    const metadata = checkoutMetadata(await loadCheckoutContext(db, IDS));
    expect(metadata.partner_member_id).toBe("");
    expect(metadata.partner_subscription_id).toBe("");
  });
});

describe("it refuses rather than charging", () => {
  it("an order that does not exist", async () => {
    expect(await refusalCode({ ...fixtures(), orders: [] }, IDS)).toBe("ORDER_NOT_FOUND");
  });

  it("an order already confirmed — the webhook has been through it, this would double-charge", async () => {
    expect(await refusalCode(fixtures({ order: { status: "confirmed" } }), IDS)).toBe(
      "ORDER_NOT_PENDING",
    );
  });

  it("an order belonging to a different member", async () => {
    expect(await refusalCode(fixtures({ order: { member_id: PARTNER } }), IDS)).toBe(
      "IDS_DO_NOT_MATCH",
    );
  });

  it("a payment record attached to a different order", async () => {
    expect(
      await refusalCode(
        fixtures({ payment: { order_id: "99999999-9999-9999-9999-999999999999" } }),
        IDS,
      ),
    ).toBe("IDS_DO_NOT_MATCH");
  });

  it("a payment that is already completed", async () => {
    expect(await refusalCode(fixtures({ payment: { status: "completed" } }), IDS)).toBe(
      "PAYMENT_NOT_PENDING",
    );
  });

  it("a subscription belonging to a different member", async () => {
    expect(await refusalCode(fixtures({ subscription: { member_id: PARTNER } }), IDS)).toBe(
      "IDS_DO_NOT_MATCH",
    );
  });

  it("a subscription that is already active — a plan change is not a signup", async () => {
    expect(await refusalCode(fixtures({ subscription: { status: "active" } }), IDS)).toBe(
      "SUBSCRIPTION_NOT_PENDING",
    );
  });

  it("a member with no email to send a receipt to", async () => {
    expect(
      await refusalCode(
        fixtures({ members: [{ id: MEMBER, first_name: "Ana", last_name: "Ruiz", email: null }] }),
        IDS,
      ),
    ).toBe("MEMBER_NOT_FOUND");
  });

  it("a pendant count that contradicts the subscription's has_pendant flag", async () => {
    expect(
      await refusalCode(fixtures({ pendantCount: 1, subscription: { has_pendant: false } }), IDS),
    ).toBe("IDS_DO_NOT_MATCH");
  });
});

describe("the couple hole: charged for two, activated as one", () => {
  /**
   * The partner member is reachable ONLY through the ids the browser sends back — nothing in
   * the schema links a partner `members` row to the order. A client that dropped them produced
   * a paid couple whose second member stayed `inactive` for ever, silently. So a couple plan
   * without partner ids is a refusal.
   */
  it("refuses a couple plan when the request names no partner", async () => {
    expect(await refusalCode(fixtures({ plan: "couple", pendantCount: 2 }), IDS)).toBe(
      "PARTNER_REQUIRED",
    );
  });

  it("refuses a couple plan when only one of the two partner ids is present", async () => {
    expect(
      await refusalCode(fixtures({ plan: "couple", pendantCount: 2 }), {
        ...IDS,
        partnerMemberId: PARTNER,
      }),
    ).toBe("PARTNER_REQUIRED");
  });

  it("refuses when the partner subscription belongs to somebody else", async () => {
    expect(
      await refusalCode(
        fixtures({ plan: "couple", pendantCount: 2, partnerSubscription: { member_id: MEMBER } }),
        COUPLE_IDS,
      ),
    ).toBe("PARTNER_MISMATCH");
  });

  it("refuses when the two halves are on different plans", async () => {
    expect(
      await refusalCode(
        fixtures({
          plan: "couple",
          pendantCount: 2,
          partnerSubscription: { plan_type: "single" },
        }),
        COUPLE_IDS,
      ),
    ).toBe("PARTNER_MISMATCH");
  });

  it("refuses when the two halves are on different billing frequencies", async () => {
    expect(
      await refusalCode(
        fixtures({
          plan: "couple",
          freq: "monthly",
          pendantCount: 2,
          partnerSubscription: { billing_frequency: "annual" },
        }),
        COUPLE_IDS,
      ),
    ).toBe("PARTNER_MISMATCH");
  });

  it("refuses a partner attached to a SINGLE membership — those ids would reach the webhook", async () => {
    expect(await refusalCode(fixtures({ plan: "single" }), { ...IDS, partnerMemberId: PARTNER, partnerSubscriptionId: PARTNER_SUB })).toBe(
      "PARTNER_MISMATCH",
    );
  });

  it("refuses when the partner member row is missing", async () => {
    const tables = fixtures({ plan: "couple", pendantCount: 2 });
    expect(
      await refusalCode(
        { ...tables, members: [tables.members[0]] },
        COUPLE_IDS,
      ),
    ).toBe("PARTNER_NOT_FOUND");
  });
});

describe("the charge must equal the order the customer read", () => {
  it("accepts a two-cent rounding difference and nothing larger", () => {
    expect(() => assertChargeMatchesOrder(10_002, 100.0)).not.toThrow();
    expect(() => assertChargeMatchesOrder(9_998, 100.0)).not.toThrow();
    expect(() => assertChargeMatchesOrder(10_003, 100.0)).toThrow(/prices changed/i);
    expect(() => assertChargeMatchesOrder(9_997, 100.0)).toThrow(/prices changed/i);
  });

  it("refuses with ORDER_PRICING_CHANGED, naming both figures", () => {
    try {
      assertChargeMatchesOrder(5_000, 100.0);
      throw new Error("should have refused");
    } catch (e) {
      expect((e as { code: string }).code).toBe("ORDER_PRICING_CHANGED");
      expect((e as Error).message).toContain("100.00");
      expect((e as Error).message).toContain("50.00");
    }
  });

  it("catches a price edited between registration and the Pay button", async () => {
    // The order was recorded at the old total; today's synced Prices say something else.
    const tables = fixtures({ pendantCount: 1, order: { total_amount: 49.99 } });
    const { db } = makeDb(tables);
    const context = await loadCheckoutContext(db, IDS);
    const pricing = await loadPricingInputs(db);
    const resolved = resolveCheckoutLines(
      {
        membershipType: context.subscription.membershipType,
        billingFrequency: context.subscription.billingFrequency,
        pendantCount: context.pendantCount,
        includeShipping: true,
        registrationFeeEnabled: pricing.registrationFeeEnabled,
        registrationFeeDiscount: pricing.registrationFeeDiscount,
      },
      pricing.prices,
      pricing.config,
    );

    expect(() => assertChargeMatchesOrder(resolved.totalCents, context.order.totalAmount)).toThrow(
      /ORDER_PRICING_CHANGED|prices changed/i,
    );
  });
});

describe("pricing inputs come from our tables, or not at all", () => {
  it("reads only is_current synced prices, and the fee switches", async () => {
    const { db, seen } = makeDb(fixtures());
    const pricing = await loadPricingInputs(db);

    expect(pricing.prices.length).toBe(SYNCED_PRICES.length);
    expect(pricing.registrationFeeEnabled).toBe(true);
    expect(pricing.registrationFeeDiscount).toBe(0);

    const priceQuery = seen.find((q) => q.table === "stripe_prices");
    expect(priceQuery?.filters).toEqual([["is_current", true]]);
  });

  it("throws PRICING_NOT_CONFIGURED rather than falling back to a literal", async () => {
    const { db } = makeDb({ ...fixtures(), pricing_plans: [] });
    await expect(loadPricingInputs(db)).rejects.toBeInstanceOf(PricingNotConfiguredError);
  });

  it("treats a missing registration_fee_enabled row as ENABLED", async () => {
    const { db } = makeDb({ ...fixtures(), system_settings: [] });
    const pricing = await loadPricingInputs(db);
    // A missing row must not silently stop charging a fee the price list still advertises.
    expect(pricing.registrationFeeEnabled).toBe(true);
  });

  it("switches the fee off only on the literal string 'false'", async () => {
    const { db } = makeDb({
      ...fixtures(),
      system_settings: [{ key: "registration_fee_enabled", value: "false" }],
    });
    expect((await loadPricingInputs(db)).registrationFeeEnabled).toBe(false);
  });
});

describe("the function body itself", () => {
  const source = readSource("supabase/functions/create-checkout/index.ts");

  it("takes no amount from the request and builds no price_data", () => {
    expect(source).not.toMatch(/body\.lineItems/);
    expect(source).not.toMatch(/unit_amount/);
    expect(source).not.toMatch(/price_data/);
    // The old open redirect and the old trusted metadata bag.
    expect(source).not.toMatch(/body\.successUrl|body\.cancelUrl/);
    expect(source).not.toMatch(/\.\.\.body\.metadata/);
  });

  it("is a subscription, built from the shared modules", () => {
    expect(source).toMatch(/mode:\s*"subscription"/);
    expect(source).not.toMatch(/mode:\s*"payment"/);
    expect(source).toMatch(/from "\.\.\/_shared\/checkout-lines\.ts"/);
    expect(source).toMatch(/from "\.\.\/_shared\/checkout-order\.ts"/);
    expect(source).toMatch(/toStripeLineItems\(resolved\.lines\)/);
    // Stripe rejects payment_intent_data in subscription mode.
    expect(source).not.toMatch(/payment_intent_data/);
  });

  it("writes the expected total to payments.amount server-side", () => {
    // The webhook's amount_total comparison is only worth something because this number never
    // passed through a browser.
    expect(source).toMatch(/amount:\s*Number\(\(resolved\.totalCents \/ 100\)/);
  });

  it("logs no PII", () => {
    const logs = source.match(/console\.(log|warn|error)\([^\n]*/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toMatch(/email|first_name|last_name|phone/i);
    }
  });

  it("still sends the join wizard back to /join so the confirmation screen can poll", () => {
    expect(source).toMatch(/\/join\?success=true&order=/);
  });
});

describe("the client sends ids and nothing priced", () => {
  const source = readSource("src/components/join/steps/JoinPaymentStep.tsx");
  const stripeCall =
    source.slice(source.indexOf('invoke("create-checkout"'), source.indexOf("checkoutUrl = checkoutResult.url;", source.indexOf('invoke("create-checkout"')));

  it("has a create-checkout call to inspect", () => {
    expect(stripeCall.length).toBeGreaterThan(50);
  });

  it("passes no lineItems, no urls, no email and no metadata bag", () => {
    for (const field of ["lineItems", "successUrl", "cancelUrl", "customerEmail", "customerName", "metadata"]) {
      expect(stripeCall).not.toMatch(new RegExp(`${field}\\s*:`));
    }
  });

  it("passes both partner ids when there is a partner", () => {
    expect(stripeCall).toMatch(/partnerMemberId/);
    expect(stripeCall).toMatch(/partnerSubscriptionId/);
  });
});

/**
 * Source with comments stripped.
 *
 * The assertions below are about what the CODE does, and the code's header comment names every
 * defect it replaced — `price_data`, `mode: "payment"`, `body.lineItems`. Scanning the raw file
 * therefore fails on the very documentation that explains the fix, which would push the next
 * person to delete the history rather than keep it. (The same phantom bit the wiring inventory:
 * a doc comment in `functionError.ts` was scanned as a real edge.)
 */
function readSource(relative: string): string {
  const raw = readFileSync(join(process.cwd(), relative), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
