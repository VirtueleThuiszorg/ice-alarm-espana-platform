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

/**
 * WHICH OF LEE'S RULES A FAILURE BREAKS.
 *
 * A red step that says "the first invoice is 0" tells whoever reads the job summary what
 * happened; it does not tell them what it COSTS. These name the rule, in his words, so the
 * summary reads as a consequence rather than as a Stripe error code.
 */
export const RULES = {
  FULL_AT_SETUP:
    'Lee\'s rule 1 — "a member pays the month\'s fee the moment they set up ... No EUR0 setups, ' +
    'no future anchors, no proration"',
  SAME_DAY:
    'Lee\'s rule 1 — "and again exactly one month later ... the setup day becomes their billing day"',
  NEVER_TWICE:
    'Lee\'s rule 3 — "nobody pays twice or loses monitoring"',
  ONE_RETRY:
    'Lee\'s rule 4 — "one Stripe smart retry, then staff bell + friendly SMS; monitoring continues"',
  WEBHOOK_ONLY:
    "Golden rule 4 — activation/flip only on Stripe's webhook events",
};

/**
 * What a step reports.
 *
 * THREE STATES, NOT TWO. `ok: null` is UNPROVEN — the step could not be attempted at all — and it
 * is deliberately not a pass and not a failure of Stripe's. Collapsing it into either is how a
 * rehearsal starts lying: "not run" reported as green is the `--no-sepa` trap, and reported as a
 * Stripe failure sends somebody hunting through the dashboard for a defect that is really a
 * missing credential.
 */
export class Step {
  constructor(name) {
    this.name = name;
    this.ok = null;
    this.detail = "";
    /** The Stripe object ids this step actually relied on, so a failure can be looked up. */
    this.ids = [];
    /** Which of Lee's rules a failure here breaks. Empty on a pass. */
    this.rule = "";
  }
  /** Record the Stripe ids this step read, whatever its verdict. */
  using(...ids) {
    this.ids.push(...ids.filter(Boolean));
    return this;
  }
  pass(detail) {
    this.ok = true;
    this.detail = detail;
    return this;
  }
  fail(detail, rule = "") {
    this.ok = false;
    this.detail = detail;
    this.rule = rule;
    return this;
  }
  /** Could not be attempted. Never a pass; never blamed on Stripe. */
  unproven(detail) {
    this.ok = null;
    this.detail = detail;
    return this;
  }
}

/**
 * THE TWO EVENTS THE DESTINATION MUST BE SUBSCRIBED TO.
 *
 * A SEPA Checkout Session completes `unpaid` and the money moves days later, so the member is
 * activated by the LATER event, never by the completion. If the destination is not subscribed to
 * these, the platform never hears that the money arrived: the member stays `switch_pending`,
 * which has already taken them OUT of the Santander run, and nobody collects from them at all.
 */
export const REQUIRED_ASYNC_EVENTS = [
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
];

/** The API version Lee pinned the destination to. A different one changes the event payloads. */
export const EXPECTED_API_VERSION = "2024-06-20";

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
 * WHERE STRIPE SENDS THE EVENTS, AND WHETHER IT SENDS THE TWO THAT MATTER.
 *
 * This is the one half of "did the async events arrive at our destination" that a test key can
 * answer on its own, and it answers the more useful half. A SEPA member is activated by
 * `checkout.session.async_payment_succeeded`, which arrives DAYS after they complete the link;
 * if no enabled destination is subscribed to it, the platform never hears that the money came in.
 * The member then sits in `switch_pending` — already removed from the Santander run — and NOBODY
 * collects from them. That is silent, and it is the most expensive thing on this list.
 *
 * Checking it needs no Checkout Session and no browser: the subscription list is account
 * configuration, readable with the key.
 *
 * URLs ARE PRINTED, secrets are not. A destination URL is one of our own function endpoints and
 * is exactly what somebody needs to see to tell test from live; the signing secret lives on the
 * same object and is never read here.
 */
export async function checkWebhookDestination(api, record, { expectedApiVersion = EXPECTED_API_VERSION } = {}) {
  const step = record(new Step("the destination is subscribed to the two async events"));

  let list;
  try {
    list = await api("GET", "/v1/webhook_endpoints?limit=100");
  } catch (error) {
    /* A key without `rak_webhook_endpoint_read` can still run the whole rehearsal, so this must
       not take the run down with it — but it is UNPROVEN, never a pass. */
    return step.unproven(
      `could not list webhook endpoints (${error.message}). The rehearsal below still ran; this ` +
        "one question was not answered, so check Developers -> Webhooks by hand.",
    );
  }

  const all = list?.data ?? [];
  const enabled = all.filter((e) => e.status !== "disabled");
  step.using(...enabled.map((e) => e.id));

  if (all.length === 0) {
    return step.fail(
      "NO WEBHOOK DESTINATION EXISTS ON THIS ACCOUNT AT ALL. destination not subscribed or wrong " +
        "environment — check that this key belongs to the same account the destination is on.",
      RULES.WEBHOOK_ONLY,
    );
  }

  const covering = enabled.filter(
    (e) =>
      Array.isArray(e.enabled_events) &&
      // `*` is Stripe's "every event", which does cover both.
      (e.enabled_events.includes("*") || REQUIRED_ASYNC_EVENTS.every((t) => e.enabled_events.includes(t))),
  );

  const describe = (e) =>
    `${e.id} ${e.url} [${e.status}${e.api_version ? `, api ${e.api_version}` : ", api: account default"}]`;

  if (covering.length === 0) {
    const missingPer = enabled.map((e) => {
      const missing = REQUIRED_ASYNC_EVENTS.filter((t) => !(e.enabled_events ?? []).includes(t));
      return `${describe(e)} missing ${missing.join(" and ")}`;
    });
    return step.fail(
      "destination not subscribed or wrong environment — no enabled destination carries BOTH " +
        `${REQUIRED_ASYNC_EVENTS.join(" and ")}. A SEPA member would complete their link, pay ` +
        "days later, and the platform would never hear it: they stay switch_pending, out of the " +
        "Santander run, and nobody collects from them.\n      " +
        (missingPer.length ? missingPer.join("\n      ") : `${all.length} destination(s), all disabled`),
      RULES.WEBHOOK_ONLY,
    );
  }

  /* THE PINNED VERSION IS A SEPARATE QUESTION AND A SOFTER ONE. A destination on a different API
     version still delivers these events; the payload shape differs. Worth saying out loud rather
     than failing the run over, because the handlers read only fields that are stable across these
     versions. */
  const wrongVersion = covering.filter((e) => e.api_version && e.api_version !== expectedApiVersion);
  const versionNote = wrongVersion.length
    ? ` NOTE: ${wrongVersion.map((e) => `${e.id} is pinned to ${e.api_version}, not ${expectedApiVersion}`).join("; ")}.`
    : "";

  return step.pass(`${covering.length} destination(s) carry both events: ${covering.map(describe).join("; ")}.${versionNote}`);
}

/**
 * Move the clock to `to` and wait for Stripe to finish, because it advances asynchronously.
 *
 * Returns whether it became ready. Every caller must treat "not ready" as a reason to stop
 * asserting rather than to read a stale object — an invoice read while the clock is still
 * advancing is the invoice from BEFORE the advance, and asserting on it would pass for the
 * wrong reason.
 */
export async function advanceClock(api, clockId, to, { pollAttempts = 30, pollMs = 2000 } = {}) {
  await api("POST", `/v1/test_helpers/test_clocks/${clockId}/advance`, { frozen_time: Math.floor(to) });
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const state = await api("GET", `/v1/test_helpers/test_clocks/${clockId}`);
    if (state.status === "ready") return true;
    if (state.status === "internal_failure") return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
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
    /* How far to move the clock to let a SEPA debit resolve. Stripe settles test-mode SEPA a few
       days out; 14 is comfortably past that without being so far that the next billing cycle is
       also crossed, which would put a SECOND invoice on the subscription and make "the first
       debit" ambiguous. */
    settleDays = 14,
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

  /* ── 0. WHERE THE EVENTS GO ───────────────────────────────────────────────
     First, because it is the only question here whose answer can be wrong while every other step
     passes. A perfectly-behaving Stripe account with no destination subscribed to the two async
     events leaves SEPA members un-activated for ever, and nothing below would notice. */
  await checkWebhookDestination(api, record);

  // ── 1. a clock, frozen on the member's day ─────────────────────────────────
  const clockStep = record(new Step("a test clock, frozen on the member's billing day"));
  const frozen = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day) / 1000;
  const clock = await api("POST", "/v1/test_helpers/test_clocks", {
    frozen_time: Math.floor(frozen),
    name: "billing migration rehearsal",
  });
  const clockId = need(clock, "id", clockStep, "no clock, so nothing below can be timed");
  if (!clockId) return summarise(steps);
  clockStep.pass(`clock ${clockId} frozen on day ${day}`);

  // ── 2. a member, and the price they are on ─────────────────────────────────
  const setupStep = record(new Step("a customer on that clock, with our price"));
  const customer = await api("POST", "/v1/customers", {
    test_clock: clockId,
    description: "billing migration rehearsal",
  });
  const customerId = need(customer, "id", setupStep, "no customer to bill");
  if (!customerId) return summarise(steps);

  const price = await api("POST", "/v1/prices", {
    unit_amount: amountCents,
    currency,
    recurring: { interval },
    product_data: { name: "ICE Alarm monitoring (rehearsal)" },
  });
  const priceId = need(price, "id", setupStep, "no price, so there is nothing to charge");
  if (!priceId) return summarise(steps);

  const pm = await api("POST", "/v1/payment_methods", {
    type: "card",
    card: { token: "tok_visa" },
  });
  const pmId = need(pm, "id", setupStep, "no payment method");
  if (!pmId) return summarise(steps);
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
  if (!subId) return summarise(steps);
  subStep.pass(`subscription ${subId}, status ${sub.status}`);

  // ── 4. THE ONE THIS EXISTS FOR: charged in FULL, at once ───────────────────
  const chargeStep = record(new Step("the FULL fee is taken at once — not €0, not prorated"));
  const first = sub.latest_invoice;
  const paid = need(first, "amount_paid", chargeStep, "cannot tell what was charged");
  if (paid === undefined) return summarise(steps);

  if (paid === 0) {
    chargeStep.fail(
      "THE FIRST INVOICE IS €0. A €0 invoice does not pay a Checkout Session, so the webhook " +
        "would never activate them — while switch_pending has already taken them out of the " +
        "Santander run. Nobody would be collecting. Check for a trial or a billing_cycle_anchor.",
      RULES.FULL_AT_SETUP,
    );
  } else if (paid !== amountCents) {
    chargeStep.fail(
      `The first invoice is ${paid}, not the full ${amountCents}. That is a proration, and the ` +
        "member is paying part of a month they did not ask to part-pay for.",
      RULES.FULL_AT_SETUP,
    );
  } else if (first.status !== "paid") {
    chargeStep.fail(`The first invoice is ${first.status}, not paid.`, RULES.FULL_AT_SETUP);
  } else {
    chargeStep.using(first.id).pass(`${paid} ${currency} taken immediately, invoice ${first.id} paid`);
  }

  // ── 5. and again a month later, on the SAME day ────────────────────────────
  const nextStep = record(new Step("the next charge lands on the same day of the month"));
  const periodEnd = need(sub, "current_period_end", nextStep, "cannot tell when the next charge is due");
  if (periodEnd === undefined) return summarise(steps);

  const ready = await advanceClock(api, clockId, Number(periodEnd) + 3600, { pollAttempts, pollMs });
  if (!ready) {
    /* UNPROVEN, not failed. A clock that stalled says nothing about whether the renewal would
       have landed on the right day, and reporting it as a Stripe defect sends somebody looking
       for one that is not there. */
    nextStep.unproven(
      `the test clock did not become ready after ${pollAttempts} checks — re-run and look at ` +
        `clock ${clockId} in the Stripe dashboard`,
    );
    return summarise(steps);
  }

  const invoices = await api("GET", `/v1/invoices?subscription=${subId}&limit=10`);
  const list = invoices?.data ?? [];
  const renewal = list.find((inv) => inv.billing_reason === "subscription_cycle");

  if (!renewal) {
    nextStep.fail(
      `no renewal invoice after advancing the clock a ${interval}. Invoices seen: ` +
        list.map((i) => `${i.id}/${i.billing_reason}/${i.status}`).join(", "),
      RULES.SAME_DAY,
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

    nextStep.using(renewal.id);
    if (landedOn !== day && !clamped) {
      nextStep.fail(
        `the renewal landed on day ${landedOn}, not ${day} (and not a month-end clamp)`,
        RULES.SAME_DAY,
      );
    } else if (renewal.amount_paid !== amountCents) {
      nextStep.fail(`the renewal charged ${renewal.amount_paid}, not the full ${amountCents}`, RULES.SAME_DAY);
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
    const common = { api, record, need, clockId, priceId, amountCents, settleDays, pollAttempts, pollMs };
    await sepaStep({ ...common, iban: ibanOk, expect: "settles" });
    await sepaStep({ ...common, iban: ibanFail, expect: "bounces" });
  } else {
    // NOT RUN IS NOT PASSED. A skipped half that reported nothing would let somebody read a green
    // rehearsal as covering the path most of these members will take.
    record(new Step("the SEPA half")).fail(
      "skipped by --no-sepa — this is NOT a pass",
      RULES.NEVER_TWICE,
    );
  }

  return summarise(steps);
}

/**
 * The verdict, with UNPROVEN kept separate from FAILED.
 *
 * `ok` is true only when every step passed — an unproven step is not a pass, so it does not
 * produce a green run. But `failed` and `unproven` are reported apart, because they need
 * different people: a failure is Stripe (or us) behaving wrongly and belongs to whoever reads
 * the assertion; an unproven step is a missing permission or a clock that stalled, and belongs
 * to whoever runs it again.
 */
export function summarise(steps) {
  const failed = steps.filter((s) => s.ok === false);
  const unproven = steps.filter((s) => s.ok === null);
  return {
    ok: failed.length === 0 && unproven.length === 0,
    stripeOk: failed.length === 0,
    failed,
    unproven,
    steps,
  };
}

/**
 * One SEPA subscription, its first debit, and WHEN the money actually moves.
 *
 * ── WHY THIS ADVANCES THE CLOCK ───────────────────────────────────────────────
 *
 * Reading the invoice at the moment the subscription is created answers half a question. A SEPA
 * debit is `open` with a payment `processing` at that instant whether it is going to settle or
 * bounce — the two look identical until days later. So a rehearsal that stopped there would give
 * the same answer for the good IBAN and the bad one, and report a pass for both.
 *
 * Advancing the clock is what separates them, and it is also what makes the ORDERING assertion
 * possible, which is the one Lee's brief actually asks for: the member is activated by the LATER
 * event and not by the completion. Stripe-side that is exactly "the first invoice was NOT paid
 * when the subscription was created, and became paid afterwards", and both halves are recorded.
 *
 * ── WHAT THIS CANNOT DO, STATED RATHER THAN PAPERED OVER ──────────────────────
 *
 * It cannot produce a `checkout.session.async_payment_succeeded` event, because that event only
 * exists for a Checkout Session somebody COMPLETED IN A BROWSER, and no script can complete one.
 * What it produces is the invoice-level equivalent on the same subscription — the money moving
 * late, and the retry after a bounce. The platform's handling of the checkout events themselves
 * is executed in `src/test/stripeWebhookExecuted.test.ts`, and whether the destination is
 * subscribed to them is step 0 above. Those three together are the whole of it; none of them
 * alone is, and the report says so.
 */
async function sepaStep({
  api,
  record,
  need,
  clockId,
  priceId,
  amountCents,
  iban,
  expect,
  settleDays = 14,
  pollAttempts = 30,
  pollMs = 2000,
}) {
  const label = expect === "settles" ? "a SEPA debit that settles" : "a SEPA debit that BOUNCES";
  const step = record(new Step(label));

  const customer = await api("POST", "/v1/customers", {
    test_clock: clockId,
    description: `rehearsal ${expect}`,
    email: "rehearsal@example.test",
  });
  const customerId = need(customer, "id", step, "no customer for the SEPA path");
  if (!customerId) return step;
  step.using(customerId);

  const pm = await api("POST", "/v1/payment_methods", {
    type: "sepa_debit",
    sepa_debit: { iban },
    billing_details: { name: "Rehearsal Member", email: "rehearsal@example.test" },
  });
  const pmId = need(pm, "id", step, "no SEPA payment method — check the test IBAN, or whether SEPA Direct Debit is enabled on this account");
  if (!pmId) return step;
  await api("POST", `/v1/payment_methods/${pmId}/attach`, { customer: customerId });
  step.using(pmId);

  const sub = await api("POST", "/v1/subscriptions", {
    ...switchSubscriptionParams({ customer: customerId, price: priceId, paymentMethod: pmId }),
    payment_settings: { payment_method_types: ["sepa_debit"] },
  });
  const subId = need(sub, "id", step, "no SEPA subscription");
  if (!subId) return step;
  step.using(subId);

  const invoice = sub.latest_invoice;
  const statusAtCreation = need(invoice, "status", step, "cannot tell what happened to the first debit");
  if (statusAtCreation === undefined) return step;
  step.using(invoice.id);

  /* THE AMOUNT IS THE SAME QUESTION AS THE CARD PATH: a €0 or prorated first invoice is the trap
     whichever way it is paid, and it is worth failing here too rather than assuming the card run
     already covered it. */
  const due = invoice.amount_due ?? invoice.amount_paid;
  if (due !== amountCents) {
    return step.fail(
      `the first SEPA invoice ${invoice.id} is for ${due}, not the full ${amountCents}`,
      RULES.FULL_AT_SETUP,
    );
  }

  /* THE ORDERING HALF, recorded before anything is advanced. If Stripe had marked it paid at
     creation there would be no later event to activate on, and the platform's rule — activate on
     async_payment_succeeded, never on completion — would have nothing to hang on. */
  const unpaidAtCreation = statusAtCreation !== "paid";

  const now = await api("GET", `/v1/test_helpers/test_clocks/${clockId}`);
  const from = Number(now?.frozen_time ?? 0);
  if (!from) {
    return step.unproven(
      `could not read the clock's frozen_time, so the debit could not be settled or bounced. ` +
        `Invoice ${invoice.id} was \`${statusAtCreation}\` at creation.`,
    );
  }

  const ready = await advanceClock(api, clockId, from + settleDays * 86_400, { pollAttempts, pollMs });
  if (!ready) {
    return step.unproven(
      `the test clock did not become ready after advancing ${settleDays} days, so what happened ` +
        `to invoice ${invoice.id} is unknown. Re-run, or look at clock ${clockId} in the dashboard.`,
    );
  }

  const settled = await api("GET", `/v1/invoices/${invoice.id}`);
  const finalStatus = need(settled, "status", step, "cannot re-read the invoice after the clock moved");
  if (finalStatus === undefined) return step;

  if (expect === "settles") {
    if (finalStatus !== "paid") {
      return step.fail(
        `after ${settleDays} days invoice ${invoice.id} is \`${finalStatus}\`, not paid. The debit ` +
          "never settled, so the member would never be activated — and switch_pending has already " +
          "taken them out of the Santander run, so nobody is collecting from them at all.",
        RULES.NEVER_TWICE,
      );
    }
    if (!unpaidAtCreation) {
      /* Not a Stripe defect — a change in what the platform may rely on. If the debit is already
         paid at creation, activating on the later event would strand a member whose event never
         comes, and the ordering the webhook depends on is no longer true. */
      return step.fail(
        `invoice ${invoice.id} was ALREADY \`paid\` when the subscription was created. The platform ` +
          "activates a SEPA member on async_payment_succeeded rather than on completion precisely " +
          "because the money moves later; if it no longer does, that ordering needs re-checking.",
        RULES.WEBHOOK_ONLY,
      );
    }
    return step.pass(
      `invoice ${invoice.id} was \`${statusAtCreation}\` at creation and \`paid\` ${settleDays} days ` +
        `later — ${due} taken. That gap is the reason the member is activated by ` +
        "async_payment_succeeded and never by the completion itself.",
    );
  }

  // expect === "bounces"
  if (finalStatus === "paid") {
    return step.fail(
      `the failing test IBAN was PAID (${invoice.id}). Either the IBAN is no longer a failing one ` +
        "— pass --iban-fail — or this account is not behaving as test mode should. Nothing below " +
        "this line has been tested, because the bounce never happened.",
      RULES.ONE_RETRY,
    );
  }

  const attempts = settled.attempt_count ?? 0;
  if (settled.next_payment_attempt) {
    return step.pass(
      `invoice ${invoice.id} is \`${finalStatus}\` after ${attempts} attempt(s), with the next retry ` +
        `scheduled for ${new Date(settled.next_payment_attempt * 1000).toISOString().slice(0, 10)} — ` +
        "Stripe retries before the platform bells the office and texts the member.",
    );
  }

  return step.fail(
    `invoice ${invoice.id} is \`${finalStatus}\` after ${attempts} attempt(s) but NO retry is ` +
      'scheduled. With no retry the member is told on the FIRST failure, which is several hundred ' +
      "texts about a problem that usually fixes itself. Check Billing -> Automatic collection -> " +
      "smart retries in the Stripe dashboard.",
    RULES.ONE_RETRY,
  );
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
