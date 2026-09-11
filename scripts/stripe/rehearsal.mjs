/**
 * THE TEST-CLOCK REHEARSAL LEE'S BRIEF ASKS FOR — as a program, not a checklist.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * The brief ends: "PROVE. Stripe test mode + test clocks: monthly member completes on the 15th →
 * full charge at once, next charge 15th of next month ... SEPA path ... bounced debit → retry
 * once."
 *
 * Half of that is the PLATFORM's behaviour and is executed in vitest — the webhook's handlers
 * and the runner both run against a fake PostgREST (`stripeWebhookExecuted`,
 * `billingMigrationRunExecuted`). The other half is STRIPE's: whether a subscription created
 * with our exact parameters charges the full fee at once rather than €0, and bills again on the
 * same day of the month. Nothing in this repository can answer that, because answering it needs
 * a key.
 *
 * So the answer is written down as assertions rather than as prose. Give it a test-mode key and
 * it performs the rehearsal and reports pass or fail per step; without one it refuses and says
 * what to do. A checklist in a document is read once and interpreted differently every time; this
 * is the same rehearsal, with the same answer every time.
 *
 * ── THE ONE IT EXISTS FOR ─────────────────────────────────────────────────────
 *
 * A €0 FIRST INVOICE. Set `billing_cycle_anchor` to the member's Santander date so the cycles
 * line up — the obvious, tempting thing — and Stripe issues a €0 or prorated first invoice. A €0
 * invoice does not pay a Checkout Session, so the webhook never activates them, while
 * `switch_pending` has already taken them OUT of the Santander run. Nobody would be collecting
 * at all. `send-payment-link` sends no such parameter and the unit tests assert its absence; this
 * asserts the CONSEQUENCE, against Stripe.
 *
 * ── WHAT IT HAS NOT DONE ──────────────────────────────────────────────────────
 *
 * IT HAS NEVER BEEN RUN AGAINST THE LIVE API. This environment has no Stripe key, so the HTTP
 * shapes below are written from Stripe's documented REST surface and have not been exercised
 * against it. Its LOGIC is executed — `src/test/stripeRehearsal.test.ts` drives every step
 * against a fake Stripe and proves each assertion fails when it should. So a wrong FIELD NAME is
 * possible on the first real run; a wrong JUDGEMENT is not. Every read is checked for shape and
 * reports what was missing, rather than crashing on `undefined`, precisely so that first run is
 * a fixable message instead of a stack trace.
 *
 * A CHECKOUT SESSION CANNOT BE COMPLETED FROM HERE EITHER, by anybody: completing one needs a
 * browser. So this rehearses the SUBSCRIPTION Stripe would create — the same price, the same
 * absent parameters — which is where the billing behaviour lives. Clicking through one real
 * Checkout Session by hand remains step 0, and the report says so.
 */

/** Stripe's own cap, and the reason a switch link is not open for a week. */
export const SESSION_TTL_HOURS = 24;

/**
 * THE TEST IBANs, and why they are overridable rather than baked in.
 *
 * Stripe publishes IBANs whose SEPA debits deterministically succeed or fail in test mode. These
 * are the documented defaults; `--iban-ok` and `--iban-fail` override them, because Stripe has
 * changed its test data before and a rehearsal that cannot be pointed at the current values is a
 * rehearsal that stops working silently.
 *
 * If the first run reports "the debit neither settled nor failed", check these against Stripe's
 * testing page before suspecting the platform.
 */
export const TEST_IBAN_SUCCEEDS = "AT611904300234573201";
export const TEST_IBAN_FAILS = "AT861904300235473202";

/** What a step reports. `ok: null` means it could not be attempted, which is not a pass. */
export class Step {
  constructor(name) {
    this.name = name;
    this.ok = null;
    this.detail = "";
  }
  pass(detail) {
    this.ok = true;
    this.detail = detail;
    return this;
  }
  fail(detail) {
    this.ok = false;
    this.detail = detail;
    return this;
  }
}

/** A form-encoded body, the way Stripe's REST API wants it (nested keys as `a[b]`). */
export function formEncode(obj, prefix = "") {
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") parts.push(formEncode(item, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(formEncode(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

/** The day of the month a UNIX timestamp falls on, in UTC. */
export function dayOfMonth(unixSeconds) {
  return new Date(unixSeconds * 1000).getUTCDate();
}

/**
 * THE SUBSCRIPTION PARAMETERS UNDER TEST, and the three that must not appear.
 *
 * Built here rather than inline so the test can assert the absence directly — the defect would be
 * a parameter APPEARING, which is exactly how it is asserted in `legacySwitchToStripe.test.ts`
 * for the Checkout Session.
 */
export function switchSubscriptionParams({ customer, price, paymentMethod }) {
  return {
    customer,
    items: [{ price }],
    default_payment_method: paymentMethod,
    // No `trial_period_days`, no `billing_cycle_anchor`, no `proration_behavior`. See the header.
    expand: ["latest_invoice"],
  };
}

/**
 * The rehearsal. `api(method, path, body)` resolves to the parsed JSON, or throws.
 *
 * Returns every step it attempted, in order, whether or not they all passed — a rehearsal that
 * stops at the first failure hides the three answers after it.
 */
export async function runRehearsal(api, opts) {
  const {
    amountCents,
    currency = "eur",
    interval = "month",
    /** The day of the month the "member" pays on. 31 exercises the month-end clamp. */
    day = 15,
    log = () => {},
    /* How long to wait for the test clock. Stripe advances one asynchronously and is usually
       ready in seconds. Injectable so the test that proves the give-up path takes milliseconds
       rather than a minute — a 60-second case in a suite that runs on every PR is a 60-second
       case somebody eventually deletes. */
    pollAttempts = 30,
    pollMs = 2000,
    /* The SEPA half. Skipped only when explicitly asked for, and the report SAYS it was skipped —
       "not run" must never read as "passed". */
    sepa = true,
    ibanOk = TEST_IBAN_SUCCEEDS,
    ibanFail = TEST_IBAN_FAILS,
  } = opts;

  const steps = [];
  const record = (s) => {
    steps.push(s);
    log(s);
    return s;
  };

  const need = (obj, path, step, what) => {
    const value = path.split(".").reduce((n, k) => (n == null ? n : n[k]), obj);
    if (value === undefined || value === null) {
      step.fail(`Stripe's answer carried no \`${path}\` — ${what}. Shape: ${JSON.stringify(obj).slice(0, 300)}`);
      return undefined;
    }
    return value;
  };

  // ── 1. a clock, frozen on the member's day ─────────────────────────────────
  const clockStep = record(new Step("a test clock, frozen on the member's billing day"));
  const frozen = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day) / 1000;
  const clock = await api("POST", "/v1/test_helpers/test_clocks", {
    frozen_time: Math.floor(frozen),
    name: "billing migration rehearsal",
  });
  const clockId = need(clock, "id", clockStep, "no clock, so nothing below can be timed");
  if (!clockId) return { ok: false, steps };
  clockStep.pass(`clock ${clockId} frozen on day ${day}`);

  // ── 2. a member, and the price they are on ─────────────────────────────────
  const setupStep = record(new Step("a customer on that clock, with our price"));
  const customer = await api("POST", "/v1/customers", {
    test_clock: clockId,
    description: "billing migration rehearsal",
  });
  const customerId = need(customer, "id", setupStep, "no customer to bill");
  if (!customerId) return { ok: false, steps };

  const price = await api("POST", "/v1/prices", {
    unit_amount: amountCents,
    currency,
    recurring: { interval },
    product_data: { name: "ICE Alarm monitoring (rehearsal)" },
  });
  const priceId = need(price, "id", setupStep, "no price, so there is nothing to charge");
  if (!priceId) return { ok: false, steps };

  const pm = await api("POST", "/v1/payment_methods", {
    type: "card",
    card: { token: "tok_visa" },
  });
  const pmId = need(pm, "id", setupStep, "no payment method");
  if (!pmId) return { ok: false, steps };
  await api("POST", `/v1/payment_methods/${pmId}/attach`, { customer: customerId });
  setupStep.pass(`customer ${customerId}, price ${priceId} (${amountCents} ${currency}/${interval})`);

  // ── 3. the subscription, with our exact parameters ─────────────────────────
  const subStep = record(new Step("a subscription with the switch link's parameters"));
  const sub = await api(
    "POST",
    "/v1/subscriptions",
    switchSubscriptionParams({ customer: customerId, price: priceId, paymentMethod: pmId }),
  );
  const subId = need(sub, "id", subStep, "no subscription");
  if (!subId) return { ok: false, steps };
  subStep.pass(`subscription ${subId}, status ${sub.status}`);

  // ── 4. THE ONE THIS EXISTS FOR: charged in FULL, at once ───────────────────
  const chargeStep = record(new Step("the FULL fee is taken at once — not €0, not prorated"));
  const first = sub.latest_invoice;
  const paid = need(first, "amount_paid", chargeStep, "cannot tell what was charged");
  if (paid === undefined) return { ok: false, steps };

  if (paid === 0) {
    chargeStep.fail(
      "THE FIRST INVOICE IS €0. A €0 invoice does not pay a Checkout Session, so the webhook " +
        "would never activate them — while switch_pending has already taken them out of the " +
        "Santander run. Nobody would be collecting. Check for a trial or a billing_cycle_anchor.",
    );
  } else if (paid !== amountCents) {
    chargeStep.fail(
      `The first invoice is ${paid}, not the full ${amountCents}. That is a proration, and the ` +
        "member is paying part of a month they did not ask to part-pay for.",
    );
  } else if (first.status !== "paid") {
    chargeStep.fail(`The first invoice is ${first.status}, not paid.`);
  } else {
    chargeStep.pass(`${paid} ${currency} taken immediately, invoice ${first.id} paid`);
  }

  // ── 5. and again a month later, on the SAME day ────────────────────────────
  const nextStep = record(new Step("the next charge lands on the same day of the month"));
  const periodEnd = need(sub, "current_period_end", nextStep, "cannot tell when the next charge is due");
  if (periodEnd === undefined) return { ok: false, steps };

  await api("POST", `/v1/test_helpers/test_clocks/${clockId}/advance`, {
    frozen_time: Number(periodEnd) + 3600,
  });

  // The clock advances asynchronously; the caller polls.
  let ready = false;
  for (let attempt = 0; attempt < pollAttempts && !ready; attempt += 1) {
    const state = await api("GET", `/v1/test_helpers/test_clocks/${clockId}`);
    ready = state.status === "ready";
    if (!ready) await new Promise((r) => setTimeout(r, pollMs));
  }
  if (!ready) {
    nextStep.fail(
      `the test clock did not become ready after ${pollAttempts} checks — re-run and look at it ` +
        "in the Stripe dashboard",
    );
    return { ok: steps.every((s) => s.ok), steps };
  }

  const invoices = await api("GET", `/v1/invoices?subscription=${subId}&limit=10`);
  const list = invoices?.data ?? [];
  const renewal = list.find((inv) => inv.billing_reason === "subscription_cycle");

  if (!renewal) {
    nextStep.fail(
      `no renewal invoice after advancing the clock a ${interval}. Invoices seen: ` +
        list.map((i) => `${i.id}/${i.billing_reason}/${i.status}`).join(", "),
    );
  } else {
    const start = renewal.period_start ?? renewal.created;
    const landedOn = dayOfMonth(start);
    /* MONTH-END IS NOT A FAILURE. A 31st member is billed on the 28th in February — Stripe clamps
       to the last day of a short month, exactly as `nextRenewalFrom` does. So the day matches, or
       it is the last day of that month. */
    const lastDayOfThatMonth = new Date(
      Date.UTC(new Date(start * 1000).getUTCFullYear(), new Date(start * 1000).getUTCMonth() + 1, 0),
    ).getUTCDate();
    const clamped = day > lastDayOfThatMonth && landedOn === lastDayOfThatMonth;

    if (landedOn !== day && !clamped) {
      nextStep.fail(`the renewal landed on day ${landedOn}, not ${day} (and not a month-end clamp)`);
    } else if (renewal.amount_paid !== amountCents) {
      nextStep.fail(`the renewal charged ${renewal.amount_paid}, not the full ${amountCents}`);
    } else {
      nextStep.pass(
        `renewal ${renewal.id} charged ${renewal.amount_paid} on day ${landedOn}` +
          (clamped ? " (clamped to the month end, as it should be)" : ""),
      );
    }
  }

  // ── 6 and 7. the SEPA half ────────────────────────────────────────────────
  //
  // Most of these members have paid by direct debit for a decade, so this is the path they will
  // actually take — and it is the one with a trap of its own: a SEPA checkout completes `unpaid`
  // and the money moves DAYS later, so "the session completed" and "we have been paid" are
  // different events. The platform's handling of both is executed in vitest
  // (`stripeWebhookExecuted`); what cannot be checked there is whether Stripe behaves this way.
  if (sepa) {
    await sepaStep({
      api,
      steps,
      record,
      need,
      clockId,
      priceId,
      amountCents,
      iban: ibanOk,
      expect: "settles",
    });
    await sepaStep({
      api,
      steps,
      record,
      need,
      clockId,
      priceId,
      amountCents,
      iban: ibanFail,
      expect: "bounces",
    });
  } else {
    // NOT RUN IS NOT PASSED. A skipped half that reported nothing would let somebody read a green
    // rehearsal as covering the path most of these members will take.
    record(new Step("the SEPA half")).fail("skipped by --no-sepa — this is NOT a pass");
  }

  return { ok: steps.every((s) => s.ok === true), steps };
}

/**
 * One SEPA subscription, and what Stripe does with its first debit.
 *
 * `expect: "settles"` is the ordinary path: the invoice is not paid when the subscription is
 * created — it is `open` with a payment `processing` — and becomes `paid` once the debit clears.
 * A rehearsal that demanded `paid` immediately would fail on Stripe behaving correctly.
 *
 * `expect: "bounces"` is Lee's rule 4: ONE Stripe smart retry, and then the platform's own bell
 * and text. What this checks is the Stripe half — that the failure leaves a retry SCHEDULED
 * rather than giving up at once, because "one retry then tell them" is only true if Stripe
 * actually retries.
 */
async function sepaStep({ api, record, need, clockId, priceId, amountCents, iban, expect }) {
  const label = expect === "settles" ? "a SEPA debit that settles" : "a SEPA debit that BOUNCES";
  const step = record(new Step(label));

  const customer = await api("POST", "/v1/customers", {
    test_clock: clockId,
    description: `rehearsal ${expect}`,
    email: "rehearsal@example.test",
  });
  const customerId = need(customer, "id", step, "no customer for the SEPA path");
  if (!customerId) return;

  const pm = await api("POST", "/v1/payment_methods", {
    type: "sepa_debit",
    sepa_debit: { iban },
    billing_details: { name: "Rehearsal Member", email: "rehearsal@example.test" },
  });
  const pmId = need(pm, "id", step, "no SEPA payment method — check the test IBAN");
  if (!pmId) return;
  await api("POST", `/v1/payment_methods/${pmId}/attach`, { customer: customerId });

  const sub = await api("POST", "/v1/subscriptions", {
    ...switchSubscriptionParams({ customer: customerId, price: priceId, paymentMethod: pmId }),
    payment_settings: { payment_method_types: ["sepa_debit"] },
  });
  const subId = need(sub, "id", step, "no SEPA subscription");
  if (!subId) return;

  const invoice = sub.latest_invoice;
  const status = need(invoice, "status", step, "cannot tell what happened to the first debit");
  if (status === undefined) return;

  /* THE AMOUNT IS THE SAME QUESTION AS THE CARD PATH: a €0 or prorated first invoice is the trap
     whichever way it is paid, and it is worth failing here too rather than assuming the card run
     already covered it. */
  const due = invoice.amount_due ?? invoice.amount_paid;
  if (due !== amountCents) {
    step.fail(`the first SEPA invoice is for ${due}, not the full ${amountCents}`);
    return;
  }

  if (expect === "settles") {
    if (status === "paid") {
      step.pass(`invoice ${invoice.id} settled — ${due} taken`);
    } else if (status === "open") {
      // Correct and expected: SEPA takes days. What matters is that it was not refused.
      step.pass(
        `invoice ${invoice.id} is \`open\` with the debit presented — SEPA settles days later, ` +
          "which is exactly why the webhook must handle async_payment_succeeded",
      );
    } else {
      step.fail(`the first SEPA invoice is \`${status}\`, which is neither settled nor presented`);
    }
    return;
  }

  // expect === "bounces"
  if (status === "paid") {
    step.fail(
      `the failing test IBAN was PAID (${invoice.id}). Either the IBAN is no longer a failing ` +
        "one — pass --iban-fail — or this account is not behaving as test mode should.",
    );
    return;
  }
  if (invoice.next_payment_attempt) {
    step.pass(
      `invoice ${invoice.id} is \`${status}\` with a retry scheduled for ` +
        `${new Date(invoice.next_payment_attempt * 1000).toISOString().slice(0, 10)} — ` +
        "Stripe retries once before the platform bells the office and texts the member",
    );
  } else {
    step.fail(
      `invoice ${invoice.id} is \`${status}\` but NO retry is scheduled. Lee's rule is "one Stripe ` +
        'smart retry, then staff bell + friendly SMS" — with no retry, the member is told on the ' +
        "first failure, which is several hundred texts about a problem that usually fixes itself.",
    );
  }
}

/**
 * What to print when there is no key — and why it is a refusal rather than a skip.
 *
 * A rehearsal that "passes" because it did nothing is the exact shape of failure CLAUDE.md's
 * merge rules name: "a check that cannot fail is not a check". So it exits non-zero.
 */
export const NO_KEY_MESSAGE =
  "No Stripe TEST key. Set STRIPE_TEST_KEY (sk_test_...) and run again.\n" +
  "This rehearsal is PENDING_FOR_LEE S39 and it is the half of the billing migration that no\n" +
  "test in this repository can cover: whether Stripe, given the parameters send-payment-link\n" +
  "uses, charges the full fee at once and bills again on the same day of the month.\n" +
  "It refuses rather than skipping, because a rehearsal that reports success without running\n" +
  "is worse than no rehearsal at all.";
