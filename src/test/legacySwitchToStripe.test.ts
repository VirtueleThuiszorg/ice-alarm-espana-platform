// @vitest-environment node
//
// MOVING A LEGACY MEMBER ONTO STRIPE — item 2 of the billing-migration goal.
//
// ONE FAILURE DOMINATES THIS FILE, and every assertion below is downstream of it: SOMEBODY IS
// STILL RUNNING THE SANTANDER COLLECTION while the migration happens. A member who pays Stripe
// and is still in that run is charged twice in one month, by us, for the same monitoring — from
// an account belonging to somebody in their eighties.
//
// `switch_pending` is what prevents it, and everything here is about keeping that state honest:
//
//   * it is entered only when a Stripe session really exists (service-role function, refused
//     from a browser);
//   * it is left only by the payment webhook, or by the 14-day lapse that puts the member back
//     in the run with a bell so somebody rings them;
//   * and the session that takes them out of the run must be one Stripe will actually accept and
//     actually charge — no trial, no anchor, no proration, no €0 first invoice.
//
// THE €0 TRAP IS THE ONE WORTH READING TWICE. The natural-looking design is to anchor the Stripe
// cycle to the member's Santander date so the two line up. It produces a €0 or prorated first
// invoice; a €0 invoice does not pay a Checkout Session; the webhook therefore never activates
// them — while `switch_pending` has already taken them out of the Santander run. Nobody would be
// collecting at all, and nothing would say so.
//
// The database half is proven by execution in `scripts/rls/isolation.sql` against real
// PostgreSQL 16. This file covers the pure modules and the contracts a source scan can hold.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  LEGACY_SWITCH_EXPIRY_DAYS,
  legacySwitchPaymentMethods,
  legacySwitchSelection,
  switchNoticeEmail,
  switchNoticeSms,
} from "../../supabase/functions/_shared/legacy-switch";
import { sendPaymentLinkSchema } from "../../supabase/functions/_shared/validation";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const MIGRATION_FILE = "20260911130000_legacy_switch_to_stripe.sql";
/** Statements only: a phrase in a comment is documentation, not behaviour. */
const sql = read(`supabase/migrations/${MIGRATION_FILE}`).replace(/^\s*--.*$/gm, "");
const rawSql = read(`supabase/migrations/${MIGRATION_FILE}`);
const fn = read("supabase/functions/send-payment-link/index.ts");
const postPayment = read("supabase/functions/_shared/post-payment.ts");

describe("what a switch link charges, and what it does not", () => {
  const selection = legacySwitchSelection({ membershipType: "couple", billingFrequency: "monthly" });

  it("carries the membership and nothing else", () => {
    expect(selection.membershipType).toBe("couple");
    expect(selection.billingFrequency).toBe("monthly");
  });

  // They joined in 2014. Charging it again is charging somebody to stay.
  it("never charges the registration fee", () => {
    expect(selection.registrationFeeEnabled).toBe(false);
    expect(selection.registrationFeeDiscount).toBe(0);
  });

  // They are wearing it. A second one on the invoice is a device nobody ordered — and
  // `includeShipping` would post it to them.
  it("never charges for a pendant, and never ships one", () => {
    expect(selection.pendantCount).toBe(0);
    expect(selection.includeShipping).toBe(false);
  });

  it("keeps whatever plan they are on, single or couple, monthly or annual", () => {
    expect(legacySwitchSelection({ membershipType: "single", billingFrequency: "annual" }))
      .toMatchObject({ membershipType: "single", billingFrequency: "annual" });
  });
});

describe("which payment methods a switch offers", () => {
  // A decade of direct debits is the habit we are asking them to keep; card-only asks a
  // 79-year-old to find a card.
  it("asks for SEPA beside card once the webhook destination is confirmed", () => {
    expect(legacySwitchPaymentMethods(true)).toEqual(["card", "sepa_debit"]);
  });

  /*
    AND DROPS IT WHEN IT IS NOT. A SEPA checkout completes `unpaid` and activates only on
    `checkout.session.async_payment_succeeded`. A member who signs the mandate while nothing is
    listening has ALSO left the Santander export — so they would be billed by nobody at all.
  */
  it("falls back to card alone when nothing is listening for the async event", () => {
    expect(legacySwitchPaymentMethods(false)).toEqual(["card"]);
  });

  it("goes through the same acknowledgement the settings screen uses, not a hard-coded list", () => {
    expect(read("supabase/functions/_shared/legacy-switch.ts")).toContain("normaliseSelection");
  });
});

describe("what the member is told", () => {
  const input = {
    memberFirstName: "Brenda",
    amountEuros: 29.95,
    billingFrequency: "monthly" as const,
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    language: "en" as const,
  };

  /*
    THE FIRST SENTENCE IS THE ALARM. A message about money, from the company that holds
    somebody's emergency button, reads as a threat to the button unless it says otherwise before
    it says anything else.
  */
  it("leads with the alarm not changing, in all three languages", () => {
    expect(switchNoticeEmail({ ...input, language: "en" }).html).toMatch(
      /Your alarm, your pendant and the number we call stay exactly as they are/,
    );
    expect(switchNoticeEmail({ ...input, language: "es" }).html).toMatch(
      /Tu alarma, tu colgante y el número al que llamamos siguen exactamente igual/,
    );
    expect(switchNoticeEmail({ ...input, language: "nl" }).html).toMatch(
      /Je alarm, je hanger en het nummer dat we bellen blijven precies hetzelfde/,
    );
  });

  it("says the exact amount and that it repeats on this date", () => {
    const en = switchNoticeEmail(input).html;
    expect(en).toContain("€29.95");
    expect(en).toMatch(/each month on this date/);
    const annual = switchNoticeEmail({ ...input, billingFrequency: "annual" }).html;
    expect(annual).toMatch(/each year on this date/);
  });

  it("says the bank collection stops, which is the question they will ring about", () => {
    expect(switchNoticeEmail(input).html).toMatch(/stop the bank collection/i);
    expect(switchNoticeEmail({ ...input, language: "es" }).html).toMatch(/Dejaremos de pasar el recibo/);
  });

  it("offers a person, not only a button", () => {
    expect(switchNoticeEmail(input).html).toMatch(/reply to this email and we will ring you/i);
  });

  // The URL is written out as text as well as linked: a member forwarding this to the son who
  // actually does the banking needs the address to survive the forward.
  it("writes the URL out, not only behind a link", () => {
    const html = switchNoticeEmail(input).html;
    const occurrences = html.split(input.url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("escapes what it interpolates, so a name cannot become markup", () => {
    const html = switchNoticeEmail({ ...input, memberFirstName: '<script>x</script>' }).html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  // Two GSM segments including a ~90-character Stripe URL. A third segment costs money for
  // nothing, on 431 members.
  it("keeps the SMS inside two segments in every language", () => {
    for (const language of ["en", "es", "nl"] as const) {
      const sms = switchNoticeSms({ ...input, language });
      expect(sms.length, `${language}: ${sms.length} chars`).toBeLessThanOrEqual(320);
      expect(sms).toContain(input.url);
    }
  });

  it("the SMS says the alarm is unchanged too — it is the only thing many will read", () => {
    expect(switchNoticeSms(input)).toMatch(/your alarm does not change/i);
    expect(switchNoticeSms({ ...input, language: "es" })).toMatch(/tu alarma no cambia/i);
  });
});

describe("the request a switch is allowed to make", () => {
  it("accepts a member id and nothing else", () => {
    const parsed = sendPaymentLinkSchema.safeParse({
      mode: "legacy_switch",
      memberId: "11111111-1111-1111-1111-111111111111",
    });
    expect(parsed.success).toBe(true);
  });

  /*
    THE PLAN IS NOT THE BROWSER'S TO NAME. These members already have one, recorded by the CRM
    import from what Karma billed. A request that could name it could move somebody from a couple
    plan to a single one, or annual to monthly, at whatever price that implies — REVIEW_JOIN_PATH
    F7 with a different field.
  */
  it("ignores a plan somebody tries to send with it", () => {
    const parsed = sendPaymentLinkSchema.parse({
      mode: "legacy_switch",
      memberId: "11111111-1111-1111-1111-111111111111",
      membershipType: "couple",
      billingFrequency: "annual",
      pendantCount: 2,
    });
    expect(parsed).toEqual({
      mode: "legacy_switch",
      memberId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("still accepts an ordinary payment link with no mode at all", () => {
    const parsed = sendPaymentLinkSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      membershipType: "single",
      billingFrequency: "monthly",
      pendantCount: 1,
      payer: { mode: "member" },
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a signup body that has lost its plan", () => {
    const parsed = sendPaymentLinkSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      payer: { mode: "member" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("the session a switch asks Stripe for", () => {
  /*
    NO TRIAL, NO ANCHOR, NO PRORATION — Lee's rule, and the €0 trap in the header. Asserted as
    absences because that is what they are: the defect would be a parameter appearing, not one
    changing value.
  */
  for (const forbidden of ["trial_period_days", "billing_cycle_anchor", "proration_behavior"]) {
    it(`never sends ${forbidden}`, () => {
      const statements = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(statements).not.toContain(forbidden);
    });
  }

  it("is a subscription, so it renews rather than charging once", () => {
    expect(fn).toMatch(/mode:\s*"subscription"/);
  });

  it("reads the plan off the member's own record, not off the request", () => {
    expect(fn).toMatch(/from\("subscriptions"\)[\s\S]{0,200}plan_type, billing_frequency/);
  });

  it("refuses a member who is not on legacy billing before it creates anything", () => {
    expect(fn).toContain("NOT_LEGACY");
    expect(fn.indexOf("NOT_LEGACY")).toBeLessThan(fn.indexOf("stripe.checkout.sessions.create"));
  });
});

describe("entering and leaving switch_pending", () => {
  it("the migration exists exactly once", () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.includes("legacy_switch"))).toEqual([MIGRATION_FILE]);
  });

  it("adds switch_pending to the billing_source CHECK", () => {
    expect(sql).toMatch(/CHECK \(billing_source IN \('stripe', 'legacy', 'switch_pending', 'none'\)\)/);
  });

  /*
    SERVICE ROLE ONLY. A browser able to call `start_legacy_switch` could take a member out of the
    Santander export with no Stripe session behind them at all — which is the one thing the state
    exists to make impossible.
  */
  it("revokes start_legacy_switch from PUBLIC — which is the one that does the work", () => {
    /*
      MEASURED, NOT ASSUMED. A Postgres function is EXECUTE-granted to PUBLIC by default, and
      `authenticated` inherits that, so the PUBLIC revoke is what actually closes the door:
      deleting it makes the harness fail loudly (a member successfully puts themselves into
      switch_pending, and the service-role call that follows then refuses because they are
      already there).

      The `FROM authenticated` line below is belt-and-braces and survives deletion — it is
      documentation of intent, not the mechanism, and saying otherwise here would be claiming a
      guarantee the database is not giving.
    */
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.start_legacy_switch[^;]*FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.start_legacy_switch[^;]*FROM authenticated/);
  });

  it("revokes the expiry runner from authenticated too", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.expire_legacy_switches\(\)[^;]*FROM authenticated/);
  });

  it("refuses a second switch on a member who already has one out", () => {
    expect(sql).toMatch(/IF v_source <> 'legacy' THEN[\s\S]{0,200}RAISE EXCEPTION/);
  });

  it("indexes the expiry sweep so it does not walk every member daily", () => {
    const stmt = sql.match(/CREATE INDEX IF NOT EXISTS members_switch_expiry_idx[\s\S]*?;/);
    expect(stmt).not.toBeNull();
    expect(stmt![0]).toMatch(/WHERE billing_source = 'switch_pending'/);
  });

  it("guards all five billing columns against a member writing them", () => {
    const trg = sql.match(/CREATE TRIGGER guard_member_billing_self_write[\s\S]*?;/);
    expect(trg).not.toBeNull();
    for (const col of [
      "billing_source",
      "legacy_billing_day",
      "legacy_next_renewal",
      "switch_started_at",
      "switch_expires_at",
      "switch_checkout_session_id",
      "switch_checkout_url",
      "switch_session_expires_at",
    ]) {
      expect(trg![0], col).toContain(col);
    }
  });

  it("carries a rollback naming what it created", () => {
    expect(rawSql).toMatch(/ROLLBACK:/);
    expect(rawSql).toContain("DROP FUNCTION IF EXISTS public.expire_legacy_switches()");
    expect(rawSql).toContain("DROP COLUMN IF EXISTS switch_expires_at");
  });

  // The bell is the whole value of the lapse: a member back in the Santander run whom nobody has
  // moved is a phone call somebody has to make.
  it("rings the bell when a switch lapses, in its own block so a failed bell cannot undo it", () => {
    expect(sql).toMatch(/BEGIN[\s\S]*?notification_log[\s\S]*?EXCEPTION WHEN OTHERS THEN[\s\S]*?RAISE WARNING/);
  });

  it("is executed against real PostgreSQL in the isolation harness", () => {
    const iso = read("scripts/rls/isolation.sql");
    for (const claim of [
      "start_legacy_switch is NOT executable by a member",
      "nor by an ADMIN — service role only",
      "a MEMBER CANNOT set their own billing_source to switch_pending",
      "a SECOND switch on the same member is refused",
      "a switch that has NOT expired is left alone",
      "and puts them back on legacy billing with the session cleared",
      "running it again does nothing",
    ]) {
      expect(iso, claim).toContain(claim);
    }
  });
});

describe("who writes billing_source = 'stripe'", () => {
  /*
    GOLDEN RULE 4 APPLIED TO WHO BILLS, not only to who is active. The flip happens in the
    webhook's post-payment path and nowhere else — not in the screen that sent the link, not in
    the staff action, not on a timer.
  */
  it("the payment path does", () => {
    expect(postPayment).toMatch(/billing_source:\s*"stripe"/);
  });

  it("and it clears the switch columns in the same write", () => {
    // Leaving `switch_expires_at` set would let expire_legacy_switches() later find a member who
    // HAS paid and put them back on Santander billing — a double collection created by the very
    // mechanism that exists to prevent one.
    const block = postPayment.slice(postPayment.indexOf('billing_source: "stripe"'));
    expect(block).toContain("switch_expires_at: null");
    expect(block).toContain("switch_checkout_session_id: null");
  });

  it("the edge function that SENDS the link never writes it", () => {
    expect(fn).not.toMatch(/billing_source:\s*"stripe"/);
  });

  it("no browser code writes billing_source at all", () => {
    for (const rel of [
      "src/hooks/useSendPaymentLink.ts",
      "src/components/admin/member-detail/MoveToStripeCard.tsx",
      "src/pages/admin/MembersPage.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/billing_source:\s*["']/);
    }
  });
});

describe("the window", () => {
  it("is fourteen days, matching the annual notice's lead time", () => {
    expect(LEGACY_SWITCH_EXPIRY_DAYS).toBe(14);
  });

  // Stripe caps a Checkout Session at 24 hours; the switch window is 14 days. The member portal
  // needs both dates so it can say "your link has expired, ring us" rather than showing a dead
  // link to somebody who will read the expired-session page as a failed — or successful — payment.
  it("is stored separately from the Stripe session's own expiry", () => {
    expect(sql).toContain("switch_session_expires_at");
    expect(fn).toContain("_session_expires_at");
    const card = read("src/components/client/SwitchToStripeCard.tsx");
    expect(card).toContain("sessionExpiresAt");
    expect(card).toContain("member-switch-expired");
  });
});

describe("the annual ladder's middle rung, which always failed", () => {
  /*
    THE DEFECT, found by reviewing the merged work. Lee's rule gives an annual member a notice at
    14 days, a reminder at 7 and a staff phone call at 3, because one who misses the switch waits
    TWELVE MONTHS for another chance.

    The notice put them into `switch_pending`. The reminder then asked for another link and was
    refused — `billing_source` is no longer `legacy` — so the runner bells a failure and the
    member is left holding the notice's link, which STRIPE KILLED AFTER 24 HOURS. That is Stripe's
    own ceiling for a Checkout Session, against a switch window of 14 days, so for thirteen of
    those days the only link they have is dead.

    What the refusal is actually for is two LIVE sessions at once, which is how somebody is
    charged twice. An expired one is not live.
  */
  it("re-issues once Stripe has expired the previous session", () => {
    expect(fn).toMatch(/const canSwitch =/);
    expect(fn).toMatch(/member\.billing_source === "switch_pending" && !sessionStillLive/);
  });

  it("still refuses while the previous session is payable", () => {
    expect(fn).toContain("SWITCH_ALREADY_LIVE");
    expect(fn).toMatch(/two ways to pay for the same month/);
  });

  /*
    AND AN UNKNOWN EXPIRY COUNTS AS LIVE. "I cannot tell whether their link still works" must not
    resolve to "issue another one" — the safe direction is refusing, and it costs nothing
    permanent because the 14-day sweep returns them to `legacy` either way.
  */
  it("treats a missing session expiry as still live, not as expired", () => {
    expect(fn).toMatch(/member\.switch_session_expires_at === null \|\|/);
  });

  it("the database applies the same rule, so the check above is the message and not the guarantee", () => {
    const grants = read("supabase/migrations/20260911160000_billing_runner_grants.sql")
      .replace(/^\s*--.*$/gm, "");
    expect(grants).toMatch(/v_session_expires IS NULL OR v_session_expires > now\(\)/);
    expect(grants).toMatch(/already has a live switch link/);
  });

  it("and records a re-issue AS one, so 'why did they get two links' is answerable", () => {
    const grants = read("supabase/migrations/20260911160000_billing_runner_grants.sql");
    expect(grants).toMatch(/'reissued', v_source = 'switch_pending'/);
  });

  it("is executed against real PostgreSQL, in both directions", () => {
    const iso = read("scripts/rls/isolation.sql");
    expect(iso).toContain("a fresh link IS issued once Stripe has expired the previous session");
    expect(iso).toContain("but a third link is refused while the second is still payable");
    expect(iso).toContain("the re-issue is recorded AS a re-issue");
  });
});
