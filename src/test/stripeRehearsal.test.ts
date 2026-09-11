// @vitest-environment node
//
// ═══ THE REHEARSAL'S JUDGEMENT, EXECUTED — everything about it except the HTTP ═══
//
// `scripts/stripe/test-clock-rehearsal.mjs` is the half of Lee's PROVE list that no test in this
// repository can cover: whether STRIPE, given the parameters `send-payment-link` uses, charges
// the full fee at once and bills again on the same day of the month. It needs a key, and this
// environment has none.
//
// So the script has never run against the live API — and its LOGIC runs here, against a fake
// Stripe. That splits the risk honestly:
//
//   a wrong FIELD NAME   is possible on the first real run, and the script reports the missing
//                        field by name rather than crashing on `undefined`, so it is a fixable
//                        message rather than a stack trace;
//   a wrong JUDGEMENT    is not, because every assertion below is made to fail on purpose.
//
// THE ONE IT EXISTS FOR is the €0 first invoice. Set `billing_cycle_anchor` to the member's
// Santander date — the obvious, tempting thing — and Stripe issues a €0 or prorated first
// invoice; a €0 invoice does not pay a Checkout Session, so the webhook never activates them
// while `switch_pending` has already taken them out of the Santander run. Nobody would be
// collecting at all. The unit tests assert that parameter's ABSENCE; this asserts the
// CONSEQUENCE, and proves the rehearsal would catch it.

import { describe, it, expect } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MOD = "../../scripts/stripe/rehearsal.mjs";
const {
  runRehearsal,
  switchSubscriptionParams,
  formEncode,
  dayOfMonth,
  NO_KEY_MESSAGE,
  TEST_IBAN_SUCCEEDS,
  TEST_IBAN_FAILS,
} = (await import(/* @vite-ignore */ MOD)) as any;

const AMOUNT = 3294;
const DAY = 15;

/** The UNIX second for day-of-month `d` in the month `offset` months from the frozen one. */
const at = (d: number, monthOffset = 0) => {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, d) / 1000);
};

/**
 * A Stripe that answers the way a healthy test-mode account would, with named holes to punch.
 *
 * Every override is a real failure mode: a €0 first invoice, a proration, a renewal on the wrong
 * day, a clock that never becomes ready.
 */
function fakeStripe(over: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  let subscriptionCalls = 0;
  const firstInvoice = {
    id: "in_first",
    status: "paid",
    amount_paid: AMOUNT,
    billing_reason: "subscription_create",
    ...(over.firstInvoice as object),
  };
  const renewal = {
    id: "in_renewal",
    status: "paid",
    amount_paid: AMOUNT,
    billing_reason: "subscription_cycle",
    period_start: at(DAY, 1),
    ...(over.renewal as object),
  };

  const api = async (method: string, path: string, body?: Record<string, unknown>) => {
    calls.push({ method, path, body });
    if (path.startsWith("/v1/test_helpers/test_clocks") && method === "GET") {
      return { id: "clock_1", status: over.clockStatus ?? "ready" };
    }
    if (path === "/v1/test_helpers/test_clocks") return { id: "clock_1", status: "ready" };
    if (path.endsWith("/advance")) return { id: "clock_1", status: "advancing" };
    if (path === "/v1/customers") return { id: "cus_1" };
    if (path === "/v1/prices") return { id: "price_1" };
    if (path === "/v1/payment_methods") return { id: "pm_1" };
    if (path.endsWith("/attach")) return { id: "pm_1" };
    if (path === "/v1/subscriptions") {
      subscriptionCalls += 1;
      /* THREE SUBSCRIPTIONS PER RUN, in order: the card one, then SEPA-settles, then
         SEPA-bounces. Keyed on order rather than on the body, because that is what the rehearsal
         actually does and a fake that answered the same thing three times would let the two SEPA
         assertions pass on the card's response. */
      if (subscriptionCalls === 2) {
        return {
          id: "sub_sepa_ok",
          status: "active",
          latest_invoice: { id: "in_sepa_ok", status: "open", amount_due: AMOUNT },
          ...(over.sepaOkSubscription as object),
        };
      }
      if (subscriptionCalls === 3) {
        return {
          id: "sub_sepa_fail",
          status: "past_due",
          latest_invoice: {
            id: "in_sepa_fail",
            status: "open",
            amount_due: AMOUNT,
            next_payment_attempt: at(DAY, 0) + 3 * 86_400,
          },
          ...(over.sepaFailSubscription as object),
        };
      }
      return {
        id: "sub_1",
        status: "active",
        current_period_end: at(DAY, 1),
        latest_invoice: firstInvoice,
        ...(over.subscription as object),
      };
    }
    if (path.startsWith("/v1/invoices")) {
      return { data: (over.invoices as unknown[]) ?? [firstInvoice, renewal] };
    }
    throw new Error(`fake Stripe has no answer for ${method} ${path}`);
  };
  return { api, calls };
}

const run = (over: Record<string, unknown> = {}) => {
  const s = fakeStripe(over);
  return runRehearsal(s.api, { amountCents: AMOUNT, day: DAY }).then((r: any) => ({ ...r, calls: s.calls }));
};

const step = (r: any, fragment: string) =>
  r.steps.find((s: any) => s.name.includes(fragment));

describe("the parameters the rehearsal puts under test", () => {
  /*
    ASSERTED AS ABSENCES, because that is what they are: the defect would be a parameter
    APPEARING. The same three, and the same reasoning, as `legacySwitchToStripe.test.ts` asserts
    for the Checkout Session — held here against the SUBSCRIPTION Stripe actually creates.
  */
  for (const forbidden of ["trial_period_days", "billing_cycle_anchor", "proration_behavior"]) {
    it(`never sends ${forbidden}`, () => {
      const params = switchSubscriptionParams({ customer: "cus_1", price: "price_1", paymentMethod: "pm_1" });
      expect(Object.keys(params)).not.toContain(forbidden);
      expect(JSON.stringify(params)).not.toContain(forbidden);
    });
  }

  it("charges the member's own price, once", () => {
    const params = switchSubscriptionParams({ customer: "cus_1", price: "price_1", paymentMethod: "pm_1" });
    expect(params.items).toEqual([{ price: "price_1" }]);
  });
});

describe("a healthy rehearsal", () => {
  it("passes every step", async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.steps.every((s: any) => s.ok === true)).toBe(true);
  });

  it("creates everything on the test clock, so one delete cleans it all up", async () => {
    const r = await run();
    const customer = r.calls.find((c: any) => c.path === "/v1/customers");
    expect(customer?.body?.test_clock).toBe("clock_1");
  });

  it("freezes the clock on the member's own billing day", async () => {
    const r = await run();
    const clock = r.calls.find((c: any) => c.path === "/v1/test_helpers/test_clocks");
    expect(dayOfMonth(clock?.body?.frozen_time)).toBe(DAY);
  });
});

describe("THE ONE IT EXISTS FOR — a €0 first invoice", () => {
  it("FAILS, and says what a €0 invoice actually costs", async () => {
    const r = await run({ firstInvoice: { amount_paid: 0, status: "paid" } });
    const s = step(r, "FULL fee");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/€0 invoice does not pay a Checkout Session/);
    expect(s.detail).toMatch(/Nobody would be collecting/);
    expect(r.ok).toBe(false);
  });

  it("FAILS on a proration too — a part-month nobody asked to part-pay for", async () => {
    const r = await run({ firstInvoice: { amount_paid: 1600 } });
    const s = step(r, "FULL fee");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/proration/i);
  });

  it("FAILS when the first invoice did not actually get paid", async () => {
    const r = await run({ firstInvoice: { status: "open" } });
    expect(step(r, "FULL fee").ok).toBe(false);
  });
});

describe("the next charge", () => {
  it("FAILS when the renewal lands on the wrong day of the month", async () => {
    const r = await run({
      renewal: { period_start: at(3, 1) },
    });
    const s = step(r, "same day of the month");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/landed on day 3, not 15/);
  });

  /*
    BUT A MONTH-END CLAMP IS NOT A FAILURE. A 31st member is billed on the 28th in February —
    Stripe clamps to the last day of a short month, exactly as `nextRenewalFrom` does for the
    Santander dates. A rehearsal that called that a failure would send somebody looking for a bug
    in the one behaviour both sides get right.
  */
  it("ACCEPTS the month-end clamp, which is Stripe doing the right thing", async () => {
    const s = fakeStripe({
      renewal: {
        // A 31st member, billed on the 28th of a February.
        period_start: Math.floor(Date.UTC(2027, 1, 28) / 1000),
        billing_reason: "subscription_cycle",
        amount_paid: AMOUNT,
      },
    });
    const r = await runRehearsal(s.api, { amountCents: AMOUNT, day: 31 });
    const clamp = r.steps.find((x: any) => x.name.includes("same day of the month"));
    expect(clamp.ok).toBe(true);
    expect(clamp.detail).toMatch(/clamped to the month end/);
  });

  it("FAILS when the renewal charged the wrong amount", async () => {
    const r = await run({ renewal: { amount_paid: 100, period_start: at(DAY, 1) } });
    expect(step(r, "same day of the month").ok).toBe(false);
  });

  it("FAILS when no renewal invoice appeared at all, and lists what it did see", async () => {
    const r = await run({ invoices: [{ id: "in_first", billing_reason: "subscription_create", status: "paid" }] });
    const s = step(r, "same day of the month");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/no renewal invoice/);
    expect(s.detail).toMatch(/in_first/);
  });
});

describe("when Stripe answers in a shape the script did not expect", () => {
  /*
    IT HAS NEVER RUN AGAINST THE LIVE API, so this is the likely first failure: a field named
    something else. It must be a message somebody can act on rather than a crash on `undefined`,
    and it must NOT be reported as a pass.
  */
  it("names the missing field instead of throwing", async () => {
    const r = await run({ subscription: { latest_invoice: { id: "in_x" } } });
    const s = step(r, "FULL fee");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/carried no `amount_paid`/);
    expect(r.ok).toBe(false);
  });

  it("stops rather than guessing when there is no subscription at all", async () => {
    const s = fakeStripe();
    const api = async (method: string, path: string, body?: Record<string, unknown>) =>
      path === "/v1/subscriptions" ? {} : s.api(method, path, body);
    const r = await runRehearsal(api, { amountCents: AMOUNT, day: DAY });
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1).detail).toMatch(/carried no `id`/);
  });

  it("does not hang for ever on a clock that never becomes ready", async () => {
    /* The real waits are 30 × 2s; injected down to milliseconds here, because a 60-second case
       in a suite that runs on every PR is a 60-second case somebody eventually deletes. */
    const s = fakeStripe({ clockStatus: "advancing" });
    const r = await runRehearsal(s.api, {
      amountCents: AMOUNT,
      day: DAY,
      pollAttempts: 3,
      pollMs: 1,
    });
    const failed = r.steps.find((x: any) => x.name.includes("same day of the month"));
    expect(failed.ok).toBe(false);
    expect(failed.detail).toMatch(/did not become ready/);
    expect(r.ok).toBe(false);
  });
});

describe("without a key it refuses rather than skipping", () => {
  /*
    "A check that cannot fail is not a check" — CLAUDE.md's merge rules, and the reason the CLI
    exits non-zero with no key. A rehearsal that reported success because it did nothing is the
    exact shape of the CI hole that let a syntax error and a dropped security fix through.
  */
  it("says what to set, and why it will not pretend", () => {
    expect(NO_KEY_MESSAGE).toMatch(/STRIPE_TEST_KEY/);
    expect(NO_KEY_MESSAGE).toMatch(/refuses rather than skipping/);
    expect(NO_KEY_MESSAGE).toMatch(/S39/);
  });
});

describe("the form encoder Stripe's REST API needs", () => {
  it("nests the way Stripe reads it", () => {
    expect(formEncode({ items: [{ price: "price_1" }] })).toBe("items%5B0%5D%5Bprice%5D=price_1");
    expect(formEncode({ recurring: { interval: "month" } })).toBe("recurring%5Binterval%5D=month");
  });

  it("drops nothing that matters and nothing that does not", () => {
    expect(formEncode({ a: 1, b: undefined, c: null, d: "x" })).toBe("a=1&d=x");
  });

  it("escapes a value that would otherwise break the body", () => {
    expect(formEncode({ name: "ICE Alarm (rehearsal) & co" })).toContain("%26");
  });
});

/*
  ── THE SEPA HALF ──────────────────────────────────────────────────────────────

  Most of these members have paid by direct debit for a decade, so this is the path they will
  actually take. It has a trap of its own: a SEPA debit is not paid when the subscription is
  created — the money moves DAYS later — so "the invoice is open" is Stripe behaving correctly,
  and a rehearsal demanding `paid` immediately would fail on the right answer.

  The platform's handling of both outcomes is executed in `stripeWebhookExecuted.test.ts`. What
  that cannot cover, and this does, is whether STRIPE does its half: presents the debit, and
  schedules ONE retry when it bounces rather than giving up at once.
*/
describe("the SEPA half", () => {
  it("passes when the debit is presented and settles later — which is what SEPA does", async () => {
    const r = await run();
    const s = step(r, "SEPA debit that settles");
    expect(s.ok).toBe(true);
    expect(s.detail).toMatch(/settles days later/);
  });

  it("passes just the same when it has already settled", async () => {
    const r = await run({
      sepaOkSubscription: { latest_invoice: { id: "in_ok", status: "paid", amount_due: AMOUNT } },
    });
    expect(step(r, "SEPA debit that settles").ok).toBe(true);
  });

  it("FAILS when the first SEPA invoice was refused outright", async () => {
    const r = await run({
      sepaOkSubscription: { latest_invoice: { id: "in_ok", status: "void", amount_due: AMOUNT } },
    });
    const s = step(r, "SEPA debit that settles");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/neither settled nor presented/);
  });

  /*
    LEE'S RULE 4, checked on Stripe's side: "one Stripe smart retry, THEN staff bell + friendly
    SMS". That is only true if Stripe actually retries. With no retry scheduled, the member is
    told on the FIRST failure — several hundred texts about a problem that usually fixes itself,
    sent by the company that holds their emergency button.
  */
  it("passes when a bounce leaves exactly one retry scheduled", async () => {
    const r = await run();
    const s = step(r, "SEPA debit that BOUNCES");
    expect(s.ok).toBe(true);
    expect(s.detail).toMatch(/retry scheduled/);
  });

  it("FAILS when a bounce schedules NO retry, and says what that costs the member", async () => {
    const r = await run({
      sepaFailSubscription: {
        latest_invoice: { id: "in_f", status: "open", amount_due: AMOUNT, next_payment_attempt: null },
      },
    });
    const s = step(r, "SEPA debit that BOUNCES");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/NO retry is scheduled/);
    expect(s.detail).toMatch(/told on the first failure/);
  });

  it("FAILS when the 'failing' IBAN was paid — the test data has moved, not the platform", async () => {
    const r = await run({
      sepaFailSubscription: { latest_invoice: { id: "in_f", status: "paid", amount_due: AMOUNT } },
    });
    const s = step(r, "SEPA debit that BOUNCES");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/--iban-fail/);
  });

  /* The €0 trap is the same trap whichever way it is paid, so it is checked on this path too
     rather than assumed covered by the card run. */
  it("FAILS a €0 or prorated first SEPA invoice, exactly as on the card path", async () => {
    const r = await run({
      sepaOkSubscription: { latest_invoice: { id: "in_ok", status: "open", amount_due: 0 } },
    });
    const s = step(r, "SEPA debit that settles");
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/not the full/);
  });

  it("sends the SEPA subscription down the sepa_debit rail, with our same parameters", async () => {
    const r = await run();
    const sepaSubs = r.calls.filter(
      (c: any) => c.path === "/v1/subscriptions" && c.body?.payment_settings,
    );
    expect(sepaSubs).toHaveLength(2);
    expect(sepaSubs[0].body.payment_settings).toEqual({ payment_method_types: ["sepa_debit"] });
    // And still none of the three forbidden parameters.
    for (const forbidden of ["trial_period_days", "billing_cycle_anchor", "proration_behavior"]) {
      expect(JSON.stringify(sepaSubs[0].body)).not.toContain(forbidden);
    }
  });

  it("uses Stripe's documented test IBANs, and lets them be overridden", async () => {
    const r = await run();
    const ibans = r.calls
      .filter((c: any) => c.path === "/v1/payment_methods" && c.body?.type === "sepa_debit")
      .map((c: any) => c.body.sepa_debit.iban);
    expect(ibans).toEqual([TEST_IBAN_SUCCEEDS, TEST_IBAN_FAILS]);

    const s = fakeStripe();
    await runRehearsal(s.api, { amountCents: AMOUNT, day: DAY, ibanOk: "AT00", ibanFail: "AT99" });
    const overridden = s.calls
      .filter((c: any) => c.path === "/v1/payment_methods" && c.body?.type === "sepa_debit")
      .map((c: any) => c.body.sepa_debit.iban);
    expect(overridden).toEqual(["AT00", "AT99"]);
  });

  /*
    NOT RUN IS NOT PASSED. Skipping the path most of these members will take must not produce a
    green rehearsal — that is the same hole as a CI job that skips its work and reports success.
  */
  it("skipping it is reported as a FAILURE, not as silence", async () => {
    const s = fakeStripe();
    const r = await runRehearsal(s.api, { amountCents: AMOUNT, day: DAY, sepa: false });
    const skipped = r.steps.find((x: any) => x.name === "the SEPA half");
    expect(skipped.ok).toBe(false);
    expect(skipped.detail).toMatch(/NOT a pass/);
    expect(r.ok).toBe(false);
  });
});
