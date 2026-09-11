// @vitest-environment node
//
// ═══ THE BILLING MIGRATION'S "PROVE", EXECUTED — the half of it that is OURS ═══
//
// Lee's brief ends with a list of things to prove:
//
//   monthly member completes on the 15th → full charge at once, next charge 15th of next month,
//   flip to stripe on first payment; the Santander export excludes them from that day; SEPA path
//   via async_payment_succeeded; bounced debit → retry once → bell + SMS, monitored state
//   unchanged. Runner re-run sends nothing twice. RLS harness for the new columns.
//
// Some of that is STRIPE'S behaviour and cannot be proven from here: that a €29.95 subscription
// with no trial and no anchor charges €29.95 at once, and bills again a month later, is Stripe
// doing what its own documentation says. This environment has no Stripe key, so no Checkout
// Session has ever been created and no test clock advanced (BILLING_MIGRATION_REPORT.md §6).
//
// THE REST IS OURS, AND UNTIL NOW NONE OF IT HAD BEEN RUN. The handlers lived inside a file that
// calls `serve()` at import time, so every assertion about them was a source scan — "the file
// contains `billing_source: 'stripe'`". That proves a line is written. It does not prove:
//
//   · that a member ends up `stripe` with every switch column cleared in the SAME write;
//   · that a SEPA session completing `unpaid` activates NOBODY;
//   · that the later `async_payment_succeeded` then does;
//   · that a bounced debit hands the member back to the Santander collection;
//   · that a first failed invoice bells the office and says NOTHING to the member,
//     and that neither one touches `members.status`.
//
// Those five are what this file runs, against the real handlers (`_shared/stripe-webhook-handlers`)
// and a fake PostgREST (`helpers/fakeSupabase`) that records every write.
//
// WHAT IS STILL NOT PROVEN, said plainly rather than left to be discovered: the database's own
// rules — RLS, constraints, triggers — are not here. They are executed against real PostgreSQL in
// `scripts/rls/isolation.sql` (680 assertions), which is where they belong.

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeSupabase, type Seed } from "./helpers/fakeSupabase";

/*
  DYNAMIC, THROUGH A VARIABLE PATH — the same escape hatch `stripeWebhookContract.test.ts` uses,
  and for the same reason. The handlers module types its client and Stripe through Deno/URL
  specifiers (`npm:@supabase/supabase-js@2`, `https://esm.sh/stripe@14.21.0`) which Deno resolves
  and `tsc -p tsconfig.app.json` cannot. A static import would pull them into the TypeScript
  program and turn CI's typecheck red on modules that are not its to compile.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
const HANDLERS = "../../supabase/functions/_shared/stripe-webhook-handlers.ts";
const { handleEvent } = (await import(/* @vite-ignore */ HANDLERS)) as any;

/* ── the cast, once ──────────────────────────────────────────────────────────
   The fake implements the slice of PostgREST the handlers use, not the whole
   generated client type. One cast here beats one per call site. */
const asClient = (c: unknown) => c as unknown as SupabaseClient;

/** A `checkout.session.*` event for a legacy member mid-switch, with the metadata we stamp. */
function switchSession(over: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_switch",
        payment_status: "paid",
        amount_total: 2995,
        payment_intent: "pi_test_1",
        subscription: "sub_test_1",
        customer: "cus_test_1",
        metadata: {
          order_id: "11111111-1111-1111-1111-111111111111",
          payment_id: "22222222-2222-2222-2222-222222222222",
          member_id: "33333333-3333-3333-3333-333333333333",
          subscription_id: "44444444-4444-4444-4444-444444444444",
          source: "legacy-switch",
        },
        ...over,
      },
    },
  } as never;
}

/** The rows the database would return for that member: one pending €29.95 monthly subscription. */
const SWITCH_SEED: Seed = {
  payments: [{ id: "22222222-2222-2222-2222-222222222222", amount: 29.95 }],
  subscriptions: [
    {
      id: "44444444-4444-4444-4444-444444444444",
      member_id: "33333333-3333-3333-3333-333333333333",
      billing_frequency: "monthly",
    },
  ],
  staff: [{ user_id: "99999999-9999-9999-9999-999999999999", role: "admin" }],
};

/** A recorder for the post-payment step, which is five other features and not what is under test. */
function postPaymentRecorder() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    fn: (async (_db: unknown, params: Record<string, unknown>) => {
      calls.push(params);
    }) as never,
  };
}

describe("a monthly member completes their switch link", () => {
  it("flips the subscription to active and records the billing day from the PAYMENT", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const post = postPaymentRecorder();

    const out = await handleEvent(asClient(db.client), switchSession(), { postPayment: post.fn });

    expect(out.activated).toBe(true);

    const subWrite = db.writesTo("subscriptions").at(-1);
    expect(subWrite?.values.status).toBe("active");
    expect(subWrite?.values.stripe_subscription_id).toBe("sub_test_1");
    expect(subWrite?.values.registration_fee_paid).toBe(true);

    /* THE BILLING DAY. Written from today, not from the day the link was sent — and one month
       on, through the shared month-end clamp. Computed here the same way rather than hardcoded,
       because a fixed date would make this test fail every month. */
    const renewal = String(subWrite?.values.renewal_date);
    expect(renewal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date().toISOString().slice(0, 10);
    expect(renewal > today).toBe(true);
    // Within 32 days: one month, not one year, for a monthly row.
    const days = (Date.parse(renewal) - Date.parse(today)) / 86_400_000;
    expect(days).toBeGreaterThan(26);
    expect(days).toBeLessThanOrEqual(32);
  });

  it("hands the rest of the payment on with the ids it was given", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const post = postPaymentRecorder();
    await handleEvent(asClient(db.client), switchSession(), { postPayment: post.fn });

    expect(post.calls).toHaveLength(1);
    expect(post.calls[0]).toMatchObject({
      memberId: "33333333-3333-3333-3333-333333333333",
      subscriptionId: "44444444-4444-4444-4444-444444444444",
      amountPaid: 29.95,
      gateway: "stripe",
    });
  });

  /*
    GOLDEN RULE 4, RUN RATHER THAN READ. `members.status` and `billing_source` are written by the
    post-payment step and by nothing else — so the handler itself must not touch `members` at
    all. A source scan can say the string is absent; this says the write never happens.
  */
  it("writes NOTHING to members itself — the flip to `stripe` is post-payment's", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    await handleEvent(asClient(db.client), switchSession(), { postPayment: postPaymentRecorder().fn });
    expect(db.writesTo("members")).toEqual([]);
  });

  /*
    AND IT REFUSES A MISMATCH. F9: whatever Stripe said had been paid used to be accepted, which
    is what made a browser-named price a live hole. €0.01 against a €29.95 pending payment must
    activate nobody.
  */
  it("refuses to activate when the money does not match what we recorded", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const post = postPaymentRecorder();

    const out = await handleEvent(
      asClient(db.client),
      switchSession({ amount_total: 1 }),
      { postPayment: post.fn },
    );

    expect(out.activated).toBe(false);
    expect(out.refused).toBe("AMOUNT_MISMATCH");
    expect(post.calls).toEqual([]);
    expect(db.writesTo("subscriptions")).toEqual([]);
    // And a person is told: a refusal nobody sees is money sitting in Stripe against a member
    // who is not active.
    expect(db.writesTo("notification_log").length).toBeGreaterThan(0);
  });
});

describe("the SEPA path", () => {
  /*
    A DIRECT DEBIT CHECKOUT COMPLETES `unpaid`. This is the defect the webhook was built to fix
    and the one most worth running: members became active on a life-safety service before their
    bank had moved a cent.
  */
  it("activates NOBODY when the session completes unpaid", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const post = postPaymentRecorder();

    const out = await handleEvent(
      asClient(db.client),
      switchSession({ payment_status: "unpaid" }),
      { postPayment: post.fn },
    );

    expect(out.activated).toBe(false);
    expect(out.awaitingPayment).toBe(true);
    expect(post.calls).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it("and activates them when the debit clears, days later", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const post = postPaymentRecorder();

    const event = switchSession();
    (event as unknown as { type: string }).type = "checkout.session.async_payment_succeeded";
    const out = await handleEvent(asClient(db.client), event, { postPayment: post.fn });

    expect(out.activated).toBe(true);
    expect(post.calls).toHaveLength(1);
  });

  /*
    AND WHEN IT BOUNCES, THEY GO BACK INTO THE BANK COLLECTION. `switch_pending` had taken them
    out of it; before this event was handled at all, a bounce left them billed by nobody until
    the 14-day sweep found them.
  */
  it("returns a bounced first debit to legacy billing, through the shared function", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    db.rpcReturns("abandon_legacy_switch", true);

    const event = switchSession();
    (event as unknown as { type: string }).type = "checkout.session.async_payment_failed";
    const out = await handleEvent(asClient(db.client), event, { postPayment: postPaymentRecorder().fn });

    expect(out.returnedToLegacy).toBe(true);
    expect(db.rpcs).toEqual([
      {
        fn: "abandon_legacy_switch",
        args: {
          p_member_id: "33333333-3333-3333-3333-333333333333",
          p_reason: "debit_bounced",
        },
      },
    ]);
    // The payment row is marked failed, so it does not sit reading `pending` forever.
    const paymentWrite = db.writesTo("payments").at(-1);
    expect(paymentWrite?.values.status).toBe("failed");
  });

  /*
    AND A FAILURE TO RETURN THEM THROWS. Every other failed write in the webhook is logged and
    stepped over, because the money has arrived and only the record is behind. Here the money did
    NOT arrive: a member left in `switch_pending` is in NEITHER collection, so the right outcome
    is a 500 and a Stripe retry.
  */
  it("throws rather than losing a member who could not be returned", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const client = db.client as { rpc: (fn: string, args: unknown) => Promise<unknown> };
    client.rpc = () => Promise.resolve({ data: null, error: { message: "permission denied" } });

    const event = switchSession();
    (event as unknown as { type: string }).type = "checkout.session.async_payment_failed";

    await expect(
      handleEvent(asClient(db.client), event, { postPayment: postPaymentRecorder().fn }),
    ).rejects.toThrow(/abandon_legacy_switch failed/);
  });
});

describe("a failed debit never stops the monitoring", () => {
  const failedInvoice = (over: Record<string, unknown> = {}) =>
    ({
      id: "evt_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_test_1",
          subscription: "sub_test_1",
          number: "ICE-0001",
          amount_due: 2995,
          attempt_count: 1,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86_400,
          ...over,
        },
      },
    }) as never;

  const FAIL_SEED: Seed = {
    subscriptions: [
      { id: "44444444-4444-4444-4444-444444444444", member_id: "33333333-3333-3333-3333-333333333333" },
    ],
    members: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        first_name: "Mary",
        last_name: "Doe",
        phone: "+34600111222",
        preferred_language: "es",
      },
    ],
    staff: [{ user_id: "99999999-9999-9999-9999-999999999999", role: "admin" }],
    system_settings: [{ key: "settings_emergency_phone", value: "+34951234567" }],
  };

  it("the FIRST failure bells the office and says nothing at all to the member", async () => {
    const db = fakeSupabase(FAIL_SEED);
    const out = await handleEvent(asClient(db.client), failedInvoice(), {
      postPayment: postPaymentRecorder().fn,
    });

    expect(out.stage).toBe("retrying");
    expect(Number(out.adminsNotified)).toBeGreaterThan(0);
    expect(out.memberTexted).toBe(false);
    // Nothing reached them: Stripe will try again, and most direct-debit failures clear on their own.
    expect(db.invokes).toEqual([]);
  });

  it("and the member is texted only once Stripe has given up", async () => {
    const db = fakeSupabase(FAIL_SEED);
    const out = await handleEvent(
      asClient(db.client),
      failedInvoice({ next_payment_attempt: null, attempt_count: 4 }),
      { postPayment: postPaymentRecorder().fn },
    );

    expect(out.stage).toBe("exhausted");
    expect(out.memberTexted).toBe(true);
    expect(db.invokes).toHaveLength(1);
    expect(db.invokes[0].fn).toBe("twilio-sms");
    expect(db.invokes[0].body.to).toBe("+34600111222");
  });

  /*
    THE MESSAGE ITSELF, in the member's own language, and it must not read as a threat to the
    button. `payment-retry.ts` writes it and is unit-tested; this proves the handler picks the
    member's language off their record rather than defaulting to English.
  */
  it("texts them in their own language", async () => {
    const db = fakeSupabase(FAIL_SEED);
    await handleEvent(
      asClient(db.client),
      failedInvoice({ next_payment_attempt: null, attempt_count: 4 }),
      { postPayment: postPaymentRecorder().fn },
    );
    const message = String(db.invokes[0].body.message);
    expect(message).toMatch(/tu pago|no ha podido|alarma/i);
    expect(message).not.toMatch(/suspend|urgent/i);
  });

  /*
    P4, RUN RATHER THAN READ. A member whose payment bounced is still a member and an operator
    still answers their alarm. The subscription goes `past_due`; NOTHING is written to `members`.
  */
  it("marks the subscription past_due and writes nothing about the member", async () => {
    const db = fakeSupabase(FAIL_SEED);
    await handleEvent(
      asClient(db.client),
      failedInvoice({ next_payment_attempt: null, attempt_count: 4 }),
      { postPayment: postPaymentRecorder().fn },
    );

    expect(db.writesTo("subscriptions").at(0)?.values).toEqual({ status: "past_due" });
    expect(db.writesTo("members")).toEqual([]);
  });

  it("has no number to text when none is configured, and says so rather than inventing one", async () => {
    const db = fakeSupabase({ ...FAIL_SEED, system_settings: [] });
    const out = await handleEvent(
      asClient(db.client),
      failedInvoice({ next_payment_attempt: null, attempt_count: 4 }),
      { postPayment: postPaymentRecorder().fn },
    );

    expect(out.stage).toBe("exhausted");
    expect(out.memberTexted).toBe(false);
    expect(db.invokes).toEqual([]);
  });
});

describe("the signup invoice is not counted twice", () => {
  it("`invoice.paid` for a new subscription records no second payment", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const out = await handleEvent(
      asClient(db.client),
      {
        id: "evt_inv",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_first",
            subscription: "sub_test_1",
            amount_paid: 2995,
            billing_reason: "subscription_create",
          },
        },
      } as never,
      { postPayment: postPaymentRecorder().fn },
    );

    expect(out.skipped).toBe("subscription_create");
    expect(db.writesTo("payments")).toEqual([]);
  });
});

describe("an event the destination should not be sending", () => {
  /*
    THE API-VERSION CONTRACT, run. A body missing a field the handler reads is refused loudly and
    recorded as handled — a wrong destination version is otherwise SILENT, and the reads simply
    become `undefined`.
  */
  it("is refused, and a person is told rather than it being retried for three days", async () => {
    const db = fakeSupabase(SWITCH_SEED);
    const out = await handleEvent(
      asClient(db.client),
      {
        id: "evt_bad",
        type: "checkout.session.completed",
        data: { object: { id: "cs_x", payment_status: "paid", amount_total: 2995, metadata: {} } },
      } as never,
      { postPayment: postPaymentRecorder().fn },
    );

    expect(out.refused).toBe("MISSING_FIELDS");
    expect(out.missing).toContain("metadata.order_id");
    expect(db.writesTo("notification_log").length).toBeGreaterThan(0);
  });
});
