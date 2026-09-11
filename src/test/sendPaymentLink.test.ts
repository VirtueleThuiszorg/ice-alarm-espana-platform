// @vitest-environment node
//
// Item 4 — "Send payment link", and the two things it must never become.
//
// WHAT IT REPLACES: `<Button>Create Subscription</Button>` with no `onClick`. Pressing it did
// nothing at all, so a staff member could press it repeatedly believing they had signed the
// member up (Lee's dashboard notes, 9 Sep).
//
// THE TWO FAILURE MODES THESE TESTS EXIST FOR, both of which this codebase has already had:
//
//   1. THE BROWSER NAMING THE PRICE. `create-checkout` charges `Math.round(item.amount * 100)`
//      where `item.amount` came from the request body (REVIEW_JOIN_PATH.md F7), and nothing
//      server-side ever checked it (F9). Every line item here names a Stripe Price id created
//      from `pricing_plans` / `pricing_settings`, and the request schema has no amount field to
//      tamper with. Asserted both ways: the schema drops one, and the resolver refuses to charge
//      a Price that no longer matches our tables.
//
//   2. A SCREEN ACTIVATING A MEMBER. Golden rule 4: the payment webhook, and nothing else. So
//      the function is asserted to contain no write of `members.status` and no
//      `subscriptions.status = 'active'`, and the SQL it calls is proven (in the RLS harness) to
//      leave the member exactly as it found them.
//
// The database half — the pending rows, the guard trigger, the refusals — is proven by execution
// in `scripts/rls/isolation.sql` against real Postgres, not here. This file covers the pure
// modules and the contracts a source scan can hold.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  PriceResolutionError,
  TOTAL_TOLERANCE_CENTS,
  assertTotalsAgree,
  resolveCheckoutLines,
  toOrderAmounts,
  toStripeLineItems,
  type LinkSelection,
} from "../../supabase/functions/_shared/checkout-lines";
import {
  paymentLinkEmail,
  paymentLinkSms,
  planDelivery,
  planLabel,
} from "../../supabase/functions/_shared/payment-link";
import {
  calculateOrder,
  type PricingConfig,
} from "../../supabase/functions/_shared/pricing-calc";
import {
  desiredPrices,
  toCents,
  type ExistingPrice,
} from "../../supabase/functions/_shared/stripe-price-sync";
import { sendPaymentLinkSchema } from "../../supabase/functions/_shared/validation";
import { stripComments } from "./helpers/stripComments";
import { webhookSource } from "./helpers/webhookSource";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => stripComments(read(p));

const FN = "supabase/functions/send-payment-link/index.ts";
const RESOLVER = "supabase/functions/_shared/checkout-lines.ts";
const DIALOG = "src/components/admin/member-detail/SendPaymentLinkDialog.tsx";
const TAB = "src/components/admin/member-detail/SubscriptionTab.tsx";

/** The seeded live config (20260617120000), so a wrong figure here is a wrong charge. */
const SEEDED: PricingConfig = {
  single: { monthlyNet: 24.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  couple: { monthlyNet: 34.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  pendantNet: 125,
  pendantTaxRate: 0.21,
  shipping: 14.99,
  registrationBase: 59.99,
  registrationTaxRate: 0,
};

/**
 * A synced `stripe_prices` table, built FROM `desiredPrices` — i.e. what pressing "Sync prices
 * to Stripe" would leave behind. Fixtures typed by hand would drift from the sync and make
 * every "stale" assertion below meaningless.
 */
function syncedPrices(config: PricingConfig = SEEDED): ExistingPrice[] {
  return desiredPrices(config).map((d) => ({
    price_key: d.priceKey,
    stripe_product_id: `prod_${d.productKey}`,
    stripe_price_id: `price_${d.priceKey}`,
    amount_cents: d.amountCents,
    recurring_interval: d.recurringInterval,
  }));
}

const selection = (over: Partial<LinkSelection> = {}): LinkSelection => ({
  membershipType: "single",
  billingFrequency: "monthly",
  pendantCount: 1,
  includeShipping: true,
  registrationFeeEnabled: true,
  registrationFeeDiscount: 0,
  ...over,
});

const lineFor = <T extends { priceKey: string }>(lines: T[], key: string): T | undefined =>
  lines.find((l) => l.priceKey === key);

// ── the resolver: price ids, never amounts ─────────────────────────────────
describe("resolveCheckoutLines — what Stripe is asked to charge", () => {
  it("names a Price ID for every line, and no amount for any of them", () => {
    const { lines } = resolveCheckoutLines(selection(), syncedPrices(), SEEDED);
    expect(lines.every((l) => l.stripePriceId?.startsWith("price_"))).toBe(true);
    expect(lines.every((l) => l.source === "synced_price")).toBe(true);
    // The Stripe payload for these lines carries `price`, never `price_data` — no number in it.
    const payload = toStripeLineItems(lines);
    expect(payload.every((p) => "price" in p && !("price_data" in p))).toBe(true);
  });

  it("a single monthly membership with one pendant is four lines", () => {
    const { lines, totalCents } = resolveCheckoutLines(selection(), syncedPrices(), SEEDED);
    expect(lines.map((l) => l.priceKey)).toEqual([
      "plan_single_monthly",
      "pendant",
      "shipping",
      "registration_fee",
    ]);
    // 27.49 + 151.25 + 14.99 + 59.99
    expect(totalCents).toBe(2749 + 15125 + 1499 + 5999);
  });

  it("the membership is the ONE recurring line — mode: subscription depends on it", () => {
    const { lines, recurringLine } = resolveCheckoutLines(
      selection({ membershipType: "couple", billingFrequency: "annual", pendantCount: 2 }),
      syncedPrices(),
      SEEDED,
    );
    expect(recurringLine.priceKey).toBe("plan_couple_annual");
    expect(recurringLine.recurringInterval).toBe("year");
    // Everything else is a one-off on the first invoice (P1). A recurring pendant would bill a
    // €151 device every month, which is the kind of defect nobody notices for a month.
    expect(lines.filter((l) => l.recurringInterval !== null)).toHaveLength(1);
  });

  it("a couple gets TWO pendants and ONE shipping charge (P3)", () => {
    const { lines } = resolveCheckoutLines(
      selection({ membershipType: "couple", pendantCount: 2 }),
      syncedPrices(),
      SEEDED,
    );
    expect(lineFor(lines, "pendant")!.quantity).toBe(2);
    expect(lineFor(lines, "shipping")!.quantity).toBe(1); // <-- load-bearing
  });

  it("no pendant means no shipping either — there is nothing to post", () => {
    const { lines } = resolveCheckoutLines(selection({ pendantCount: 0 }), syncedPrices(), SEEDED);
    expect(lineFor(lines, "pendant")).toBeUndefined();
    expect(lineFor(lines, "shipping")).toBeUndefined();
    expect(lineFor(lines, "plan_single_monthly")).toBeDefined();
  });

  it("the registration fee disappears when the setting is off", () => {
    const { lines, totalCents } = resolveCheckoutLines(
      selection({ registrationFeeEnabled: false }),
      syncedPrices(),
      SEEDED,
    );
    expect(lineFor(lines, "registration_fee")).toBeUndefined();
    expect(totalCents).toBe(2749 + 15125 + 1499);
  });

  it("a DISCOUNTED fee is the one inline line, priced by the server", () => {
    // A Stripe Price is a fixed amount and the discount is a percentage, so it cannot be one of
    // the seven synced Prices. The amount still comes from calculateOrder, never from a client.
    const { lines } = resolveCheckoutLines(
      selection({ registrationFeeDiscount: 50 }),
      syncedPrices(),
      SEEDED,
    );
    const fee = lineFor(lines, "registration_fee")!;
    expect(fee.source).toBe("server_amount");
    expect(fee.stripePriceId).toBeNull();
    expect(fee.unitAmountCents).toBe(toCents(59.99 * 0.5));

    const payload = toStripeLineItems(lines);
    const inline = payload.find((p) => "price_data" in p) as {
      price_data: { unit_amount: number; currency: string };
    };
    expect(inline.price_data.unit_amount).toBe(toCents(59.99 * 0.5));
    expect(inline.price_data.currency).toBe("eur");
  });

  it("the lines always add up to what calculateOrder says the order costs", () => {
    for (const sel of [
      selection(),
      selection({ pendantCount: 0 }),
      selection({ membershipType: "couple", pendantCount: 2 }),
      selection({ billingFrequency: "annual" }),
      selection({ membershipType: "couple", billingFrequency: "annual", pendantCount: 2 }),
      selection({ registrationFeeEnabled: false }),
      selection({ registrationFeeDiscount: 25 }),
      selection({ includeShipping: false }),
    ]) {
      const resolved = resolveCheckoutLines(sel, syncedPrices(), SEEDED);
      const order = calculateOrder(SEEDED, {
        membershipType: sel.membershipType,
        billingFrequency: sel.billingFrequency,
        includePendant: sel.pendantCount > 0,
        pendantCount: sel.pendantCount > 0 ? sel.pendantCount : undefined,
        includeShipping: sel.pendantCount > 0 && sel.includeShipping,
        registrationFeeEnabled: sel.registrationFeeEnabled,
        registrationFeeDiscount: sel.registrationFeeDiscount,
      });
      expect(Math.abs(resolved.totalCents - toCents(order.grandTotal)))
        .toBeLessThanOrEqual(TOTAL_TOLERANCE_CENTS);
    }
  });
});

// ── the refusals, which are the safety ─────────────────────────────────────
describe("resolveCheckoutLines — what it refuses to charge", () => {
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      if (e instanceof PriceResolutionError) return e.code;
      return `unexpected: ${(e as Error).message}`;
    }
    return "no error";
  };

  it("PRICE_NOT_SYNCED when the plan has no Price yet, and it names the key", () => {
    const prices = syncedPrices().filter((p) => p.price_key !== "plan_single_monthly");
    let thrown: PriceResolutionError | null = null;
    try {
      resolveCheckoutLines(selection(), prices, SEEDED);
    } catch (e) {
      thrown = e as PriceResolutionError;
    }
    expect(thrown?.code).toBe("PRICE_NOT_SYNCED");
    expect(thrown?.priceKeys).toEqual(["plan_single_monthly"]);
    // The message must say what to do, because the person reading it can do it.
    expect(thrown?.message).toMatch(/Sync prices to Stripe/i);
  });

  it("PRICE_NOT_SYNCED for a missing pendant, shipping or fee Price too", () => {
    for (const key of ["pendant", "shipping", "registration_fee"]) {
      const prices = syncedPrices().filter((p) => p.price_key !== key);
      expect(codeOf(() => resolveCheckoutLines(selection(), prices, SEEDED))).toBe(
        "PRICE_NOT_SYNCED",
      );
    }
  });

  it("PRICE_STALE when the synced Price disagrees with the pricing tables", () => {
    // Somebody edited a price and did not press Sync. Charging the old Price would charge a
    // figure no screen in the product is showing — and both numbers look right in isolation.
    const prices = syncedPrices().map((p) =>
      p.price_key === "pendant" ? { ...p, amount_cents: p.amount_cents - 1000 } : p,
    );
    let thrown: PriceResolutionError | null = null;
    try {
      resolveCheckoutLines(selection(), prices, SEEDED);
    } catch (e) {
      thrown = e as PriceResolutionError;
    }
    expect(thrown?.code).toBe("PRICE_STALE");
    expect(thrown?.priceKeys).toEqual(["pendant"]);
  });

  it("PRICE_STALE when the membership Price has lost its interval", () => {
    // It would charge once and never renew; P1 is an auto-renewing subscription.
    const prices = syncedPrices().map((p) =>
      p.price_key === "plan_single_monthly" ? { ...p, recurring_interval: null } : p,
    );
    expect(codeOf(() => resolveCheckoutLines(selection(), prices, SEEDED))).toBe("PRICE_STALE");
  });

  it("BAD_SELECTION for a plan, frequency, pendant count or discount we do not sell", () => {
    const bad: Array<Partial<LinkSelection>> = [
      { membershipType: "family" as unknown as LinkSelection["membershipType"] },
      { billingFrequency: "weekly" as unknown as LinkSelection["billingFrequency"] },
      { pendantCount: 3 },
      { pendantCount: -1 },
      { pendantCount: 1.5 },
      { registrationFeeDiscount: 101 },
      { registrationFeeDiscount: -5 },
      { registrationFeeDiscount: Number.NaN },
    ];
    for (const over of bad) {
      expect(codeOf(() => resolveCheckoutLines(selection(over), syncedPrices(), SEEDED)), JSON.stringify(over))
        .toBe("BAD_SELECTION");
    }
  });

  it("TOTAL_MISMATCH is a divergence detector, and it bites", () => {
    // Unreachable from rounding with today's seven prices — the only multiplied line is the
    // pendant at quantity ≤ 2, so drift is at most one cent against a tolerance of two. Tested
    // directly for that reason; testing it through the resolver would be testing nothing.
    expect(() => assertTotalsAgree(10000, 10002, ["pendant"])).not.toThrow();
    expect(() => assertTotalsAgree(10000, 10003, ["pendant"])).toThrow(PriceResolutionError);
    try {
      assertTotalsAgree(10000, 12000, ["pendant"]);
    } catch (e) {
      expect((e as PriceResolutionError).code).toBe("TOTAL_MISMATCH");
    }
  });
});

// ── the amounts handed to the SQL function ─────────────────────────────────
describe("toOrderAmounts — the figures the order rows record", () => {
  it("the finals sum to the total, which is what the SQL function asserts", () => {
    for (const sel of [
      selection(),
      selection({ pendantCount: 0 }),
      selection({ membershipType: "couple", pendantCount: 2, billingFrequency: "annual" }),
      selection({ registrationFeeEnabled: false }),
      selection({ registrationFeeDiscount: 40 }),
    ]) {
      const a = toOrderAmounts(resolveCheckoutLines(sel, syncedPrices(), SEEDED));
      const sum = a.subscriptionFinal + a.pendantFinal + a.registrationFee + a.shipping;
      expect(Math.abs(sum - a.total), JSON.stringify({ sel, a })).toBeLessThanOrEqual(0.005);
    }
  });

  it("the total is what STRIPE will charge, to the cent", () => {
    const resolved = resolveCheckoutLines(selection(), syncedPrices(), SEEDED);
    expect(toOrderAmounts(resolved).total).toBe(resolved.totalCents / 100);
  });

  it("and it follows the LINES, not calculateOrder, when the two round differently", () => {
    /*
      The distinguishing case, and it needs a contrived config to exist at all.

      A Stripe Price is a per-UNIT amount in whole cents, so two pendants cost exactly twice the
      rounded unit price. `calculateOrder` multiplies first and rounds once, so where the unit
      price lands on a half-cent the two disagree by one — inside the resolver's two-cent
      tolerance, so the order is allowed, and the figure we STORE has to be the one the customer
      will actually be charged.

      Without this test, `total: order.grandTotal` passes the whole suite: every realistic
      config agrees to the cent, which is exactly why a mutation to that line survived.
    */
    const HALF_CENT: PricingConfig = { ...SEEDED, pendantNet: 10, pendantTaxRate: 0.2105 };
    const unitCents = toCents(10 * 1.2105); // 12.105 → 1211, rounded up
    const resolved = resolveCheckoutLines(
      selection({ membershipType: "couple", pendantCount: 2 }),
      syncedPrices(HALF_CENT),
      HALF_CENT,
    );
    const order = calculateOrder(HALF_CENT, {
      membershipType: "couple",
      billingFrequency: "monthly",
      includePendant: true,
      pendantCount: 2,
      includeShipping: true,
      registrationFeeEnabled: true,
      registrationFeeDiscount: 0,
    });

    // The premise: the two really do differ here, by exactly the rounding.
    expect(resolved.totalCents - toCents(order.grandTotal)).toBe(1);
    expect(lineFor(resolved.lines, "pendant")!.unitAmountCents).toBe(unitCents);

    // And the stored total is Stripe's, not the arithmetic's.
    expect(toOrderAmounts(resolved).total).toBe(resolved.totalCents / 100);
    expect(toOrderAmounts(resolved).total).not.toBe(Number(order.grandTotal.toFixed(2)));
  });

  it("the resolver actually RUNS the cross-check, rather than exporting it for show", () => {
    // `assertTotalsAgree` is tested directly above because no real data can trip it. That makes
    // deleting its CALL invisible to every behavioural test — a mutation removing the line
    // survived the suite until this assertion existed.
    const src = stripComments(read(RESOLVER));
    expect(src).toMatch(/assertTotalsAgree\(\s*totalCents/);
  });

  it("the nets are the accounting split, not the charged amount", () => {
    const a = toOrderAmounts(resolveCheckoutLines(selection(), syncedPrices(), SEEDED));
    expect(a.subscriptionNet).toBe(24.99);
    expect(a.subscriptionFinal).toBe(27.49);
    expect(a.pendantNet).toBe(125);
    expect(a.pendantFinal).toBe(151.25);
    expect(a.shipping).toBe(14.99);
    expect(a.registrationFee).toBe(59.99);
  });

  it("a couple's two pendants are one net and one final, doubled", () => {
    const a = toOrderAmounts(
      resolveCheckoutLines(selection({ membershipType: "couple", pendantCount: 2 }), syncedPrices(), SEEDED),
    );
    expect(a.pendantNet).toBe(250);
    expect(a.pendantFinal).toBe(302.5);
    expect(a.total).toBe(38.49 + 302.5 + 14.99 + 59.99);
  });

  it("no pendant leaves pendant and shipping at zero rather than absent", () => {
    // The SQL function COALESCEs, but a missing key would make the sum assertion pass on a
    // NULL, which is the shape of failure the harness's own NULL hole was.
    const a = toOrderAmounts(resolveCheckoutLines(selection({ pendantCount: 0 }), syncedPrices(), SEEDED));
    expect(a.pendantFinal).toBe(0);
    expect(a.shipping).toBe(0);
    expect(Object.keys(a)).toContain("pendantTaxRate");
  });
});

// ── delivery: never claim a send that did not happen ──────────────────────
describe("planDelivery — which channels are even attempted", () => {
  const base = { smsChannelOn: true, emailConfigured: true, payerPhone: "+34600111222", payerEmail: "p@x.es" };
  const byChannel = (input: Parameters<typeof planDelivery>[0]) =>
    Object.fromEntries(planDelivery(input).map((d) => [d.channel, d]));

  it("attempts both when both are on and addressed", () => {
    const d = byChannel(base);
    expect(d.sms.attempt).toBe(true);
    expect(d.email.attempt).toBe(true);
  });

  it("reports Lee's SMS switch being OFF as exactly that", () => {
    // Every channel flag is false today (D7). "It didn't send" must name the switch, or somebody
    // spends an afternoon on Twilio.
    const d = byChannel({ ...base, smsChannelOn: false });
    expect(d.sms.attempt).toBe(false);
    expect(d.sms.outcome).toBe("skipped_channel_off");
  });

  it("reports the switch first even when there is also no phone number", () => {
    const d = byChannel({ ...base, smsChannelOn: false, payerPhone: null });
    expect(d.sms.outcome).toBe("skipped_channel_off");
  });

  it("reports a missing address as an address problem", () => {
    const d = byChannel({ ...base, payerPhone: "   ", payerEmail: undefined });
    expect(d.sms.outcome).toBe("skipped_no_address");
    expect(d.email.outcome).toBe("skipped_no_address");
    expect(d.sms.to).toBeNull();
  });

  it("reports an unconfigured mail sender distinctly from a missing address", () => {
    const d = byChannel({ ...base, emailConfigured: false });
    expect(d.email.outcome).toBe("skipped_not_configured");
  });

  it("always returns BOTH channels, so a silence is impossible", () => {
    expect(planDelivery({ ...base, smsChannelOn: false, emailConfigured: false })).toHaveLength(2);
  });
});

describe("the message", () => {
  const message = {
    payerFirstName: "Diana",
    memberFullName: "Lena Link",
    payerIsSomeoneElse: true,
    planLabel: "Couple membership, billed monthly, 2 pendants",
    totalEuros: 426.96,
    url: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
    language: "en" as const,
  };

  it("the SMS carries the link, the amount and who it is for", () => {
    const sms = paymentLinkSms(message);
    expect(sms).toContain(message.url);
    expect(sms).toContain("€426.96");
    expect(sms).toContain("Lena Link");
    expect(sms).toContain("ICE Alarm");
  });

  it("carries the link in EVERY language, not just the default branch", () => {
    // One `return` per language, so dropping the URL from one of them is a per-language defect.
    for (const language of ["en", "es", "nl"] as const) {
      expect(paymentLinkSms({ ...message, language }), language).toContain(message.url);
    }
  });

  it("fits two GSM segments, URL included", () => {
    // A third segment costs money for nothing, on every link ever sent.
    for (const language of ["en", "es", "nl"] as const) {
      const sms = paymentLinkSms({ ...message, language });
      expect(sms.length, `${language}: ${sms.length} chars`).toBeLessThanOrEqual(320);
    }
  });

  it("does not name the member when the member is the payer", () => {
    const sms = paymentLinkSms({ ...message, payerIsSomeoneElse: false, payerFirstName: "Lena" });
    expect(sms).not.toContain("for Lena Link");
    expect(sms).toContain(message.url);
  });

  it("the email writes the URL out as text as well as linking it", () => {
    // A member forwarding this to the family member who pays must not lose the address.
    const { html, subject } = paymentLinkEmail(message);
    expect(subject).toContain("€426.96");
    expect(html.split(message.url).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("the email escapes what it interpolates", () => {
    const { html } = paymentLinkEmail({
      ...message,
      payerFirstName: '<script>alert("x")</script>',
      memberFullName: "A & B",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("is written in the member's language", () => {
    expect(paymentLinkEmail({ ...message, language: "es" }).subject).toContain("Enlace de pago");
    expect(paymentLinkEmail({ ...message, language: "nl" }).subject).toContain("Betaallink");
  });

  it("planLabel says the plan, the billing and the pendants", () => {
    expect(planLabel("couple", "annual", 2)).toBe("Couple membership, billed annually, 2 pendants");
    expect(planLabel("single", "monthly", 0)).toBe("Single membership, billed monthly, no pendant");
    expect(planLabel("single", "monthly", 1)).toBe("Single membership, billed monthly, 1 pendant");
  });
});

// ── the request schema: the absence IS the feature ────────────────────────
describe("sendPaymentLinkSchema", () => {
  const valid = {
    memberId: "11111111-1111-1111-1111-111111111111",
    membershipType: "single",
    billingFrequency: "monthly",
    pendantCount: 1,
    payer: { mode: "member" },
  };

  it("accepts a plan and who pays", () => {
    expect(sendPaymentLinkSchema.safeParse(valid).success).toBe(true);
  });

  it("DROPS any amount a client tries to send", () => {
    const parsed = sendPaymentLinkSchema.parse({
      ...valid,
      amount: 1,
      total: 0.01,
      lineItems: [{ name: "free membership", amount: 0, quantity: 1 }],
      priceId: "price_attacker",
      successUrl: "https://evil.example/thanks",
    });
    for (const key of ["amount", "total", "lineItems", "priceId", "successUrl"]) {
      expect(parsed, key).not.toHaveProperty(key);
    }
  });

  it("refuses more than two pendants and a negative count", () => {
    expect(sendPaymentLinkSchema.safeParse({ ...valid, pendantCount: 3 }).success).toBe(false);
    expect(sendPaymentLinkSchema.safeParse({ ...valid, pendantCount: -1 }).success).toBe(false);
    expect(sendPaymentLinkSchema.safeParse({ ...valid, pendantCount: 1.5 }).success).toBe(false);
  });

  it("refuses a plan or frequency it does not sell", () => {
    expect(sendPaymentLinkSchema.safeParse({ ...valid, membershipType: "family" }).success).toBe(false);
    expect(sendPaymentLinkSchema.safeParse({ ...valid, billingFrequency: "weekly" }).success).toBe(false);
  });

  it("a separate payer needs a name and an email, and a real email", () => {
    expect(
      sendPaymentLinkSchema.safeParse({ ...valid, payer: { mode: "other", fullName: "Diana" } }).success,
    ).toBe(false);
    // The other way round, which a "needs an email" assertion alone does not cover: an email
    // and no name. A nameless payer is a Stripe customer nobody can identify on a statement.
    expect(
      sendPaymentLinkSchema.safeParse({
        ...valid,
        payer: { mode: "other", email: "diana@example.com" },
      }).success,
    ).toBe(false);
    expect(
      sendPaymentLinkSchema.safeParse({
        ...valid,
        payer: { mode: "other", fullName: "   ", email: "diana@example.com" },
      }).success,
    ).toBe(false);
    expect(
      sendPaymentLinkSchema.safeParse({
        ...valid,
        payer: { mode: "other", fullName: "Diana", email: "not-an-email" },
      }).success,
    ).toBe(false);
    expect(
      sendPaymentLinkSchema.safeParse({
        ...valid,
        payer: { mode: "other", fullName: "Diana Daughter", email: "diana@example.com", phone: "+34600111222" },
      }).success,
    ).toBe(true);
  });

  it("refuses an unknown payer mode rather than defaulting to one", () => {
    expect(sendPaymentLinkSchema.safeParse({ ...valid, payer: { mode: "partner" } }).success).toBe(false);
    expect(sendPaymentLinkSchema.safeParse({ ...valid, payer: {} }).success).toBe(false);
  });
});

// ── golden rule 4, as a source contract ───────────────────────────────────
describe("nothing in this path activates anybody", () => {
  const fn = code(FN);

  it("the function exists and is wired to the shared resolver", () => {
    expect(existsSync(join(ROOT, FN))).toBe(true);
    expect(fn).toContain('from "../_shared/checkout-lines.ts"');
    expect(fn).toContain("resolveCheckoutLines");
  });

  it("it never writes members.status, and never writes 'active' anywhere", () => {
    expect(fn).not.toMatch(/from\(["']members["']\)[\s\S]{0,300}?update\(/);
    expect(fn).not.toMatch(/status:\s*["']active["']/);
  });

  it("it records the rows through the SQL function, which is service-role only", () => {
    expect(fn).toContain('rpc("create_payment_link_order"');
    // And it does NOT insert those rows itself — that would be three writes with no transaction.
    expect(fn).not.toMatch(/from\(["']orders["']\)[\s\S]{0,200}?insert\(/);
    expect(fn).not.toMatch(/from\(["']subscriptions["']\)[\s\S]{0,200}?insert\(/);
  });

  it("the only row it updates itself is the pending payment's session id", () => {
    const updates = [...fn.matchAll(/from\("(\w+)"\)\s*\n?\s*\.update\(/g)].map((m) => m[1]);
    expect(updates).toEqual(["payments"]);
  });

  it("Stripe is asked for a SUBSCRIPTION session, with the ids the webhook reads", () => {
    expect(fn).toContain('mode: "subscription"');
    for (const key of ["member_id", "order_id", "payment_id", "subscription_id"]) {
      expect(fn, key).toContain(`${key}:`);
    }
    expect(fn).toContain("subscription_data: { metadata }");
  });

  it("the redirect URLs are built server-side, never taken from the request", () => {
    // An attacker-supplied success_url on a payment page is a phishing vector, and
    // `create-checkout` takes both from the body today.
    expect(fn).toContain("SITE_URL");
    expect(fn).not.toMatch(/success_url:\s*body\./);
    expect(fn).not.toMatch(/cancel_url:\s*body\./);
  });

  it("it refuses a caller who is not active staff", () => {
    expect(fn).toContain('.eq("is_active", true)');
    // `staffRow` since the runner branch below: the staff record is read into a local and only
    // then assigned, because one caller legitimately has no staff record at all.
    expect(fn).toContain("STAFF_ROLES.includes(staffRow.role)");
    expect(fn).toContain("Staff access required");
  });

  /*
    THE ONE CALLER WITH NO PERSON BEHIND IT, and why it is not a hole.

    `billing-migration-run` paces the legacy→Stripe migration over months and calls this function
    for each member due today. There is no staff session behind a cron job, and inventing one — a
    service account with a staff row — would be a login that can send payment links and that
    nobody would ever rotate.

    So the branch is as narrow as it can be: an exact match on the service role key, and even
    then ONLY for `legacy_switch`, the mode that takes no plan, no amount and no payer from the
    request. There is nothing for such a caller to choose. An ordinary payment link is unchanged.
  */
  it("admits the scheduled runner, by service key and for the switch mode only", () => {
    expect(fn).toMatch(/isRunner = serviceKey\.length > 0 && bearer === serviceKey/);
    expect(fn).toMatch(/if \(isRunner && body\.mode !== "legacy_switch"\)/);
    expect(fn).toContain("RUNNER_SCOPE");
  });

  it("and records those as nobody's doing rather than inventing an actor", () => {
    // A NULL staff id on the audit row and on start_legacy_switch is the honest answer: nobody
    // pressed anything. `source: legacy-switch` in the Stripe metadata says which path made it.
    expect(fn).toMatch(/_staff_id: staff\?\.id \?\? null/);
    expect(fn).toMatch(/staff_id: staff\?\.id \?\? null/);
  });

  it("create-checkout now shares this price-id module — one implementation, not two", () => {
    // WAS: "stripe-webhook and create-checkout are NOT modified by this work", asserting
    // `create-checkout` did NOT contain "checkout-lines". That was true and right while this
    // function was being added on its own: the join path is gated (CLAUDE.md), so item 4 built
    // the module and deliberately left the customer-facing charge alone. Item 5 is the work
    // that adopts it, so the assertion inverts — the rule it was protecting ("share the
    // module, never a second copy") is the same rule, now satisfied in the other direction.
    const checkout = read("supabase/functions/create-checkout/index.ts");
    expect(checkout).toContain("_shared/checkout-lines.ts");
    expect(checkout).toContain("_shared/checkout-pricing.ts");

    // Neither function may re-implement the pricing fetch it shares.
    for (const source of [fn, checkout]) {
      expect(source).not.toContain("buildPricingConfig");
      expect(source).not.toContain('from("pricing_plans")');
    }

    // The webhook still reads its ids from the session metadata both functions stamp — item 5b
    // now destructures it once (`const metadata = session.metadata ?? {}`) instead of
    // repeating `session.metadata?.x` at each use, so the contract is asserted on the fields
    // rather than on the old spelling.
    const webhook = webhookSource();
    expect(webhook).toContain("checkout.session.completed");
    expect(webhook).toMatch(/const metadata = session\.metadata/);
    for (const key of ["order_id", "payment_id", "member_id", "subscription_id"]) {
      expect(webhook, key).toMatch(new RegExp(`metadata\\.${key}`));
    }
    expect(webhook).not.toContain("send-payment-link");
  });

  it("there is ONE price-id module, not a copy per caller", () => {
    // "share the module, never a second copy". Any function building line items must import the
    // resolver; only the legacy create-checkout may still construct its own.
    const dirs = readdirSync(join(ROOT, "supabase/functions"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const builders = dirs.filter((d) => {
      const p = join(ROOT, "supabase/functions", d, "index.ts");
      return existsSync(p) && /line_items/.test(stripComments(readFileSync(p, "utf8")));
    });
    expect(builders.sort()).toEqual(["create-checkout", "send-payment-link"]);
    expect(fn).not.toContain("price_data");
    expect(code(RESOLVER)).toContain("price_data"); // the one inline line lives here
  });
});

// ── the screen ────────────────────────────────────────────────────────────
describe("the member CRM Subscriptions tab", () => {
  const tab = code(TAB);
  const dialog = code(DIALOG);

  it("the dead Create Subscription button is gone, replaced by the dialog", () => {
    expect(tab).not.toContain("Create Subscription");
    expect(tab).toContain("<SendPaymentLinkDialog");
    expect(tab).toContain("Send payment link");
  });

  it("the dead Change Plan button is gone too", () => {
    // It had no handler either. Plan changes are switch_to_single / switch_to_couple in
    // MemberActionsCard, where they carry a reason and an actor.
    expect(tab).not.toContain("Change Plan");
    expect(read("src/lib/memberActions.ts")).toContain("switch_to_couple");
  });

  it("the tab reads the latest subscription, not only an active one", () => {
    // `.eq("status", "active")` is why it said "no subscription" to a member who had just been
    // sent a link — and an empty tab is how a second link gets sent.
    expect(tab).not.toMatch(/\.eq\("status", "active"\)/);
    expect(tab).toContain('.order("created_at", { ascending: false })');
    expect(tab).toContain("LIVE_STATUSES");
    expect(tab).toContain("past_due");
  });

  it("a pending subscription is shown as awaiting payment, not as nothing", () => {
    expect(tab).toContain("Awaiting payment");
    expect(tab).toMatch(/pending/);
  });

  it("the dialog has no price, amount or total field", () => {
    const inputs = [...dialog.matchAll(/<Input[\s\S]{0,200}?id="([^"]+)"/g)].map((m) => m[1]);
    expect(inputs.some((id) => /price|amount|total|cost|fee/i.test(id))).toBe(false);
    // The one read-only field is the link itself.
    expect(dialog).toContain('id="payment-link-url"');
    expect(dialog).toContain("readOnly");
  });

  it("the dialog never says 'sent' unless a channel reported sent", () => {
    expect(dialog).toContain("anyChannelSent(data.delivery)");
    expect(dialog).toContain("createdNotSent");
    expect(dialog).toContain("outcomeChannelOff");
  });

  it("the link is always on screen with a copy button", () => {
    expect(dialog).toContain('data-testid="payment-link-copy"');
    expect(dialog).toContain("navigator.clipboard.writeText");
  });

  it("the dialog says who activates the member, and it is not this screen", () => {
    expect(dialog).toContain("activationNote");
    const en = JSON.parse(read("src/i18n/locales/en.json"));
    expect(en.admin.paymentLink.activationNote).toMatch(/Stripe confirms/);
  });

  it("the payer copy says paying grants no access to the member's record", () => {
    // PAYER_MODEL.md §4, and the isolation suite proves it. Saying it here is what stops a
    // staff member promising the daughter she will be able to see mum's alerts.
    const en = JSON.parse(read("src/i18n/locales/en.json"));
    expect(en.admin.paymentLink.payerNote).toMatch(/no access/i);
  });
});

/*
  ── WHATSAPP, AND ONLY WHERE IT WAS ASKED FOR ──────────────────────────────────

  Lee's brief names the delivery for the legacy switch link: "SMS/WhatsApp, email when live, link
  always on screen for staff". The reason it is worth a second channel is the cohort — these
  members are in their seventies and eighties, many read WhatsApp and ignore a text from a number
  they do not recognise, and a text about money from an unrecognised number is what a scam looks
  like, so ignoring it is the sensible thing for them to do.

  IT IS OPTIONAL IN THE MODULE, and that is the whole design. A business-initiated WhatsApp
  message outside a 24-hour conversation window needs an approved template at Meta. A surface
  with no template must not attempt one: Twilio rejects it and the operator reads "failed" for
  something that was never possible. So a caller that does not ask for WhatsApp gets exactly the
  two decisions it always got.
*/
describe("planDelivery — WhatsApp", () => {
  const base = {
    smsChannelOn: true,
    emailConfigured: true,
    payerPhone: "+34600111222",
    payerEmail: "p@x.es",
  };
  const on = { channelOn: true, configured: true };
  const byChannel = (input: Parameters<typeof planDelivery>[0]) =>
    Object.fromEntries(planDelivery(input).map((d) => [d.channel, d]));

  it("is absent entirely for a caller that does not offer it", () => {
    expect(planDelivery(base).map((d) => d.channel)).toEqual(["sms", "email"]);
  });

  it("is attempted, to the same number as the text, when the caller offers it", () => {
    const d = byChannel({ ...base, whatsapp: on });
    expect(planDelivery({ ...base, whatsapp: on }).map((c) => c.channel)).toEqual([
      "sms",
      "whatsapp",
      "email",
    ]);
    expect(d.whatsapp.attempt).toBe(true);
    expect(d.whatsapp.to).toBe("+34600111222");
  });

  /*
    THE THREE REASONS, IN THIS ORDER, for the same reason the SMS decision has two: the answer
    has to name the ACTION. "Turn the channel on" and "add a WhatsApp number in Settings" send
    somebody to different screens, and reporting the address first would send them hunting for a
    phone number that would not have been used anyway.
  */
  it("names the switch before the sender, and the sender before the address", () => {
    expect(byChannel({ ...base, whatsapp: { channelOn: false, configured: false }, payerPhone: null })
      .whatsapp.outcome).toBe("skipped_channel_off");

    expect(byChannel({ ...base, whatsapp: { channelOn: true, configured: false }, payerPhone: null })
      .whatsapp.outcome).toBe("skipped_not_configured");

    expect(byChannel({ ...base, whatsapp: on, payerPhone: null }).whatsapp.outcome).toBe(
      "skipped_no_address",
    );
  });

  it("does not change what the OTHER channels decide", () => {
    const without = byChannel(base);
    const with_ = byChannel({ ...base, whatsapp: on });
    expect(with_.sms).toEqual(without.sms);
    expect(with_.email).toEqual(without.email);
  });
});

describe("the switch link's delivery, in the function itself", () => {
  const fn = code(FN);

  it("offers WhatsApp on a switch and on nothing else", () => {
    expect(fn).toMatch(/whatsapp: isSwitch/);
    expect(fn).toMatch(/const twilio = isSwitch\s*\?\s*await twilioConfigured\(admin\)/);
  });

  /*
    THROUGH THE ONE READINESS CHECK the staff notifier already uses, rather than a second reading
    of the three Twilio settings. Two copies of "is WhatsApp configured" is how one screen reports
    "not configured" while another queues Twilio 400s — PENDING_FOR_LEE S15 is that lesson, on
    this exact setting.
  */
  it("asks the shared readiness check, not the settings table directly", () => {
    expect(fn).toMatch(/from "\.\.\/_shared\/twilio-configured\.ts"/);
    expect(fn).not.toMatch(/settings_twilio_whatsapp_number/);
  });

  it("sends the same message down either pipe, naming both functions as literals", () => {
    expect(fn).toContain('functions.invoke("twilio-sms"');
    expect(fn).toContain('functions.invoke("twilio-whatsapp"');
  });

  it("reports each channel separately, so 'sent' never covers for a channel that did nothing", () => {
    expect(fn).toMatch(/channel: decision\.channel,[\s\S]{0,120}outcome: error \? "failed" : "sent"/);
  });
});
