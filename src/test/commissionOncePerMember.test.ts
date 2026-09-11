/**
 * One member is worth one partner commission, ever.
 *
 * Lee, 2026-09-08: "only on first purchase and joining … one member, one
 * payment." Two things had to change for that to be true, and both are pinned
 * here because neither can be exercised from vitest — the insert runs in the
 * admin browser against PostgREST, and the guard is a partial unique index.
 *
 * 1. The dedup check keyed on `order_id`. A member sent a replacement pendant
 *    a year later — a second order, marked delivered — earned the referrer
 *    another €50, silently, and every commission total in the admin added it up
 *    without complaint.
 *
 * 2. `partner_commissions` had no unique constraint of any kind. The only
 *    insert in the tree is a client-side SELECT followed by an INSERT, two
 *    round trips apart, so two staff marking the same order delivered in the
 *    same moment produced two rows and nothing objected.
 *
 * The amount itself was never wrong: one €50 per referral, matching the signed
 * agreement. `partnerFlatTerms.test.ts` pins that; this file pins the "once".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const orderActions = read("src/hooks/useOrderActions.ts");

/**
 * Code only. Every file changed here carries a docblock that quotes the old
 * behaviour on purpose — naming the exact thing that was wrong is what stops
 * someone reinstating it — so the negative assertions must read past comments.
 */
const codeOf = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

const code = codeOf(orderActions);

function migration(prefix: string): string {
  const dir = join(ROOT, "supabase/migrations");
  const f = readdirSync(dir).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(dir, f!), "utf8");
}

const guard = migration("20260911140200");

describe("the application asks whether the MEMBER has one, not the order", () => {
  it("the existence check filters on member_id", () => {
    expect(code).toMatch(/from\("partner_commissions"\)[\s\S]{0,200}?\.eq\("member_id", memberId\)/);
  });

  it("it no longer filters on order_id", () => {
    // The exact regression: `.eq("order_id", orderId)` on the dedup SELECT pays
    // once per delivered order rather than once per member.
    const select = code.slice(
      code.indexOf('from("partner_commissions")'),
      code.indexOf("const amountEur"),
    );
    expect(select, "dedup must not key on the order").not.toMatch(/\.eq\("order_id"/);
  });

  it("cancelled rows do not block a later, genuine delivery", () => {
    // Correcting an order out of `delivered` cancels its commission. If the
    // pendant is then really delivered, the partner must still be paid — a
    // cancelled row is not a payment.
    expect(code).toMatch(/\.neq\("status", "cancelled"\)/);
  });

  it("still writes the flat per-member amount", () => {
    expect(code).toMatch(/amountEur = COMMISSION_PER_MEMBER_EUR/);
    expect(code).toMatch(/amount_eur: amountEur/);
  });

  it("commission is still triggered by delivery, not by payment", () => {
    // The agreement makes delivery the trigger. Moving it to payment would pay
    // for pendants that never arrived.
    expect(code).toMatch(/trigger_event: "device_delivered"/);
    expect(code).toMatch(/status === "delivered"/);
  });
});

describe("the database enforces it too, because the check and the insert are not atomic", () => {
  it("creates a unique index on member_id", () => {
    expect(guard).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?partner_commissions_one_live_per_member[\s\S]*?ON public\.partner_commissions \(member_id\)/,
    );
  });

  it("excludes cancelled rows from the index, matching the application rule", () => {
    expect(guard).toMatch(/WHERE status <> 'cancelled'/);
  });

  it("cleans up existing duplicates before the index can be built", () => {
    // A unique index cannot be created over existing duplicates. The migration
    // keeps the earliest and cancels the rest with a reason.
    expect(guard).toMatch(/row_number\(\) OVER/);
    expect(guard).toMatch(/ORDER BY created_at, id/);
    expect(guard).toMatch(/SET status = 'cancelled'/);
    expect(guard).toMatch(/cancel_reason/);
  });

  it("never rewrites a PAID duplicate — it warns and leaves it to a human", () => {
    // Money that has already left the bank is not a migration's business.
    expect(guard).toMatch(/AND status <> 'paid'/);
    expect(guard).toMatch(/RAISE WARNING[\s\S]*?PAID commission/);
  });

  it("is reversible and says how", () => {
    expect(guard).toMatch(/REVERSIBLE/);
    expect(guard).toMatch(/DROP INDEX IF EXISTS public\.partner_commissions_one_live_per_member/);
  });
});

describe("the admin pricing screen no longer advertises rates nothing reads", () => {
  const page = codeOf(read("src/pages/admin/PartnerPricingSettingsPage.tsx"));

  it("the hardcoded three-tier template array is gone", () => {
    // It promised care partners €40 and residential partners €0 while the code
    // paid all three €50, and quoted those members prices they were never
    // charged.
    expect(page).not.toMatch(/DEFAULT_PRICING_TEMPLATES/);
    expect(page).not.toMatch(/commission_amount:\s*40/);
    expect(page).not.toMatch(/commission_amount:\s*0\b/);
  });

  it("it no longer writes partner_pricing_% blobs into system_settings", () => {
    expect(page).not.toMatch(/partner_pricing_\$\{/);
    expect(page).not.toMatch(/from\("system_settings"\)/);
  });

  it("member prices are read from the live pricing config, not retyped", () => {
    expect(page).toMatch(/usePricing/);
    expect(page).toMatch(/getSubscriptionMonthlyFinal|getSubscriptionFinalPrice/);
    expect(page).toMatch(/getRegistrationFee|getPendantFinalPrice/);
  });

  it("states one flat commission for all three partner types", () => {
    expect(page).toMatch(/COMMISSION_PER_MEMBER_EUR = 50/);
    expect(page).toMatch(/referral/);
    expect(page).toMatch(/care/);
    expect(page).toMatch(/residential/);
  });
});
