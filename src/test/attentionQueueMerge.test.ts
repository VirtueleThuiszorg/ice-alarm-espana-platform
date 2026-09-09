/**
 * Item 8 — the merge, and the price the Membership page shows.
 *
 * Two things that were worth extracting from their screens so they could be driven directly:
 *
 *   `mergeAttentionRows` — a member on both axes is ONE phone call, so one row; the longer wait
 *                          wins; a member whose record could not be read is dropped rather than
 *                          shown as a call with no phone number.
 *   `subscriptionPrice`  — `subscriptions.amount` is the NET, and the Membership page rendered
 *                          it as the member's price. A member debited €27.39 read €24.90.
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  mergeAttentionRows,
  isActionableRow,
  daysSince,
  type MemberSource,
  type PastDueSource,
  type ReadinessSource,
} from "@/lib/attentionQueue";
import { subscriptionPrice, taxRatePercent } from "@/lib/subscriptionPrice";
import { setPricingConfig, DEFAULT_PRICING_CONFIG } from "@/config/pricing";

const NOW = new Date("2026-09-09T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const member = (id: string, over: Partial<MemberSource> = {}): MemberSource => ({
  id,
  first_name: "Ana",
  last_name: "Ruiz",
  phone: "+34600000001",
  email: "ana@example.com",
  city: "Albox",
  preferred_language: "es",
  ...over,
});

const readiness = (id: string, over: Partial<ReadinessSource> = {}): ReadinessSource => ({
  member_id: id,
  emergency_contact_count: 0,
  device_tested_at: null,
  paid_since: daysAgo(3),
  ...over,
});

const pastDue = (id: string, days = 5): PastDueSource => ({
  member_id: id,
  renewal_date: daysAgo(days),
});

describe("mergeAttentionRows — two axes, one worklist", () => {
  it("carries a readiness row through with its gap", () => {
    const rows = mergeAttentionRows([readiness("m1")], [], [member("m1")], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].gap).toBe("both");
    expect(rows[0].paymentPastDue).toBe(false);
    expect(rows[0].daysWaiting).toBe(3);
  });

  it("carries a past_due row through as monitoring-READY", () => {
    // Not "no contacts" and not "unknown": a member whose payment failed may be perfectly
    // ready, and inventing a readiness gap for them would send an operator on the wrong call.
    const rows = mergeAttentionRows([], [pastDue("m1")], [member("m1")], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].gap).toBe("none");
    expect(rows[0].paymentPastDue).toBe(true);
    expect(rows[0].daysWaiting).toBe(5);
  });

  it("shows a member on BOTH axes exactly once", () => {
    // One phone call. Two rows means phoning them twice.
    const rows = mergeAttentionRows([readiness("m1")], [pastDue("m1")], [member("m1")], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].gap).toBe("both");
    expect(rows[0].paymentPastDue).toBe(true);
  });

  it("keeps the LONGER of the two waits", () => {
    // Otherwise adding the payment axis could make a long-waiting member look newer and drop
    // them down a list that is ordered by how long somebody has been ignored.
    const rows = mergeAttentionRows(
      [readiness("m1", { paid_since: daysAgo(2) })],
      [pastDue("m1", 40)],
      [member("m1")],
      NOW,
    );
    expect(rows[0].daysWaiting).toBe(40);
    expect(rows[0].waitingSince).toBe(daysAgo(40));
  });

  it("does NOT shorten the wait when the payment is the newer problem", () => {
    const rows = mergeAttentionRows(
      [readiness("m1", { paid_since: daysAgo(30) })],
      [pastDue("m1", 1)],
      [member("m1")],
      NOW,
    );
    expect(rows[0].daysWaiting).toBe(30);
    expect(rows[0].paymentPastDue).toBe(true);
  });

  it("orders oldest wait first, across both axes", () => {
    const rows = mergeAttentionRows(
      [readiness("m-new", { paid_since: daysAgo(1) })],
      [pastDue("m-old", 21)],
      [member("m-new"), member("m-old")],
      NOW,
    );
    expect(rows.map((r) => r.memberId)).toEqual(["m-old", "m-new"]);
  });

  it("sorts an unknown wait LAST, not first", () => {
    // Guessing "for ever" would push a member we know nothing about above members we know have
    // waited weeks.
    const rows = mergeAttentionRows(
      [readiness("m-null", { paid_since: null }), readiness("m-7", { paid_since: daysAgo(7) })],
      [],
      [member("m-null"), member("m-7")],
      NOW,
    );
    expect(rows.map((r) => r.memberId)).toEqual(["m-7", "m-null"]);
  });

  it("drops a row whose member record is missing, on either axis", () => {
    // A row with no name and no phone number is not a call anybody can make — and on this
    // screen it would read as a member being ignored.
    expect(mergeAttentionRows([readiness("gone")], [], [], NOW)).toEqual([]);
    expect(mergeAttentionRows([], [pastDue("gone")], [], NOW)).toEqual([]);
  });

  it("ignores a source row with no member id at all", () => {
    expect(mergeAttentionRows([readiness(null as unknown as string)], [], [member("m1")], NOW)).toEqual([]);
    expect(
      mergeAttentionRows([], [{ member_id: null, renewal_date: daysAgo(3) }], [member("m1")], NOW),
    ).toEqual([]);
  });

  it("takes the member's own contact details onto the row", () => {
    const rows = mergeAttentionRows([], [pastDue("m1")], [member("m1", { phone: "+34611111111" })], NOW);
    expect(rows[0].phone).toBe("+34611111111");
    expect(rows[0].city).toBe("Albox");
  });

  it("says a payment-only row is actionable, and an unknown-gap row is not", () => {
    const payment = mergeAttentionRows([], [pastDue("m1")], [member("m1")], NOW)[0];
    expect(isActionableRow(payment)).toBe(true);

    const unknown = mergeAttentionRows(
      [readiness("m2", { emergency_contact_count: null })],
      [],
      [member("m2")],
      NOW,
    )[0];
    expect(unknown.gap).toBe("unknown");
    // "We could not read it" is not a call to make; it is a thing to retry then escalate.
    expect(isActionableRow(unknown)).toBe(false);
  });
});

describe("daysSince", () => {
  it("counts whole days, floored, and never negative", () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
    expect(daysSince(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(0);
  });

  it("returns null for absent or unparseable dates, rather than 0", () => {
    // 0 means "today". Saying that about a date we could not read would put a member at the
    // bottom of a queue ordered by how long they have waited.
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince("not a date", NOW)).toBeNull();
  });
});

describe("subscriptionPrice — what the member is actually charged", () => {
  beforeEach(() => {
    setPricingConfig(DEFAULT_PRICING_CONFIG);
  });

  it("adds the plan's IVA to the contracted net", () => {
    // THE DEFECT. `subscriptions.amount` is the NET (`v_subscription_net` / `v_sub_net`), and
    // the Membership page rendered it as the price. At 10% a €24.90 net is €27.39 charged.
    const price = subscriptionPrice(24.9, "single")!;
    expect(price.net).toBe(24.9);
    expect(price.taxRate).toBeCloseTo(0.1);
    expect(price.final).toBe(27.39);
    expect(price.taxApplied).toBe(true);
    expect(taxRatePercent(price)).toBe(10);
  });

  it("uses the COUPLE plan's rate for a couple", () => {
    const price = subscriptionPrice(34.99, "couple")!;
    expect(price.final).toBe(Number((34.99 * (1 + DEFAULT_PRICING_CONFIG.couple.subscriptionTaxRate)).toFixed(2)));
  });

  it("reads the rate an admin set, not a literal", () => {
    setPricingConfig({
      ...DEFAULT_PRICING_CONFIG,
      single: { ...DEFAULT_PRICING_CONFIG.single, subscriptionTaxRate: 0.21 },
    });
    const price = subscriptionPrice(100, "single")!;
    expect(price.final).toBe(121);
    expect(taxRatePercent(price)).toBe(21);
  });

  it("keeps the member's OWN net — it does not re-price them", () => {
    // A member on an old price keeps it. Deriving the net from today's config would quietly
    // move somebody onto a price they never agreed to.
    const price = subscriptionPrice(19.99, "single")!;
    expect(price.net).toBe(19.99);
  });

  it("returns null for a missing amount rather than €0.00", () => {
    // Zero is a real price — `subscriptions.is_free_of_charge` exists — so rendering 0 for an
    // unreadable amount would tell a paying member their membership is free.
    expect(subscriptionPrice(null, "single")).toBeNull();
    expect(subscriptionPrice(undefined, "single")).toBeNull();
    expect(subscriptionPrice(Number.NaN, "single")).toBeNull();
    expect(subscriptionPrice(-5, "single")).toBeNull();
  });

  it("passes a real zero through as zero", () => {
    const price = subscriptionPrice(0, "single")!;
    expect(price.final).toBe(0);
  });

  it("reports that no tax was applied when the plan is unknown, instead of guessing", () => {
    const price = subscriptionPrice(24.9, "enterprise")!;
    expect(price.final).toBe(24.9);
    // The caller renders no "incl. IVA" line, rather than claiming a rate we do not have.
    expect(price.taxApplied).toBe(false);
  });
});
