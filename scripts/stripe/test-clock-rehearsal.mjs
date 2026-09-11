#!/usr/bin/env node
/**
 * The CLI around `rehearsal.mjs` — the key, the HTTP, and the report.
 *
 *   STRIPE_TEST_KEY=sk_test_... node scripts/stripe/test-clock-rehearsal.mjs --amount 3294
 *   node scripts/stripe/test-clock-rehearsal.mjs --day 31 --amount 3294
 *
 * `--amount` is in CENTS and is the figure the member would actually be charged — take it from
 * Admin → Settings → Pricing, or from the `total` on a real switch link's audit row, so the
 * rehearsal charges what production charges rather than a round number.
 *
 * `--day 31` is worth one run of its own: it is the month-end clamp, the case where a naive
 * `setUTCMonth(+1)` produces 3 March.
 *
 * The SEPA half runs by default, with Stripe's documented test IBANs; `--iban-ok` and
 * `--iban-fail` override them if Stripe changes its test data. `--no-sepa` skips it and REPORTS
 * the skip as a failure — most of these members pay by direct debit, and a green run that quietly
 * skipped their path would be the worst kind of green.
 *
 * EVERYTHING IT CREATES IS ON A TEST CLOCK, so deleting the clock deletes the customer, the
 * subscription and the invoices with it. The id is printed; the script does not delete it,
 * because a failed rehearsal is worth looking at in the dashboard.
 */
import { NO_KEY_MESSAGE, formEncode, runRehearsal } from "./rehearsal.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const key = process.env.STRIPE_TEST_KEY ?? flag("key", "");
if (!key) {
  console.error(NO_KEY_MESSAGE);
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  // A live key here would create a real customer and take real money off a real card.
  console.error("REFUSING: STRIPE_TEST_KEY must be a TEST key (sk_test_...). Never run this live.");
  process.exit(1);
}

const amountCents = Number(flag("amount", "0"));
if (!Number.isInteger(amountCents) || amountCents <= 0) {
  console.error("Pass --amount <cents>, the figure a real switch link would charge.");
  process.exit(1);
}

/** One Stripe call. Throws with Stripe's own message, which is always the useful one. */
async function api(method, path, body) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? formEncode(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`Stripe ${method} ${path}: ${message}`);
  }
  return json;
}

const { ok, steps } = await runRehearsal(api, {
  amountCents,
  day: Number(flag("day", "15")),
  interval: flag("interval", "month"),
  /* `--no-sepa` is for a quick card-only check. It REPORTS the skip as a failure, because most of
     these members pay by direct debit and a green run that quietly skipped their path would be
     the worst kind of green. */
  sepa: !args.includes("--no-sepa"),
  ibanOk: flag("iban-ok", undefined),
  ibanFail: flag("iban-fail", undefined),
  log: (s) => console.log(`${s.ok === true ? "PASS" : s.ok === false ? "FAIL" : "...."}  ${s.name}`),
});

console.log("");
for (const s of steps) {
  console.log(`${s.ok === true ? "PASS" : "FAIL"}  ${s.name}\n      ${s.detail}`);
}
console.log("");
console.log(
  ok
    ? "Rehearsal passed. The remaining manual step is clicking through ONE real Checkout Session\n" +
        "in test mode — completing one needs a browser, and no script can do it."
    : "Rehearsal FAILED. Do not switch the runner on.",
);
process.exit(ok ? 0 : 1);
