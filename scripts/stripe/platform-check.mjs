#!/usr/bin/env node
/**
 * DID THE ASYNC EVENTS ACTUALLY REACH US? — asked of BOTH sides, because one side cannot answer.
 *
 * ── WHY BOTH ─────────────────────────────────────────────────────────────────
 *
 * The tempting version of this check reads `webhook_events` and reports "no
 * checkout.session.async_payment_succeeded has ever been processed" as a broken destination. That
 * is wrong about half the time, and wrongly alarming the other half:
 *
 *   Stripe generated none, we processed none   nobody has completed a SEPA Checkout Session yet.
 *                                              Nothing was supposed to arrive. Reporting a broken
 *                                              destination here sends somebody into the dashboard
 *                                              after a fault that does not exist.
 *   Stripe generated some, we processed none   THE REAL FAULT: destination not subscribed, or the
 *                                              events are being sent to a different environment.
 *   Stripe generated some, we processed some   the path works end to end.
 *
 * So this asks Stripe what it SENT and the platform what it PROCESSED, and only the middle row is
 * a failure. The distinction matters because the consequence of the middle row is severe and
 * silent: a SEPA member completes their link, pays days later, and the platform never hears it —
 * they stay `switch_pending`, which has already removed them from the Santander run, so nobody
 * collects from them at all.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────
 *
 * `webhook_events` (event_id, provider, event_type, processed_at) is the webhook's own idempotency
 * ledger — a row per event it has accepted. It is service-role only by RLS, which is why this
 * needs the service key and why it is a CI job rather than something the app does.
 *
 * NO MEMBER DATA IS READ OR PRINTED. Event ids and types only; the query never touches `members`,
 * `payments` or anything carrying a name, and the output is a count and a list of `evt_...` ids.
 */

/** The two events a SEPA member's activation depends on. */
export const ASYNC_EVENT_TYPES = [
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
];

export const NOT_SUBSCRIBED =
  "destination not subscribed or wrong environment";

/**
 * The verdict, as a pure function, so every branch is testable without a key or a database.
 *
 * `sent` and `processed` are arrays of event ids. `haveDb` is false when no Supabase credentials
 * were supplied at all — which is UNPROVEN, and deliberately not the same as "we processed none".
 */
export function verdict({ sent, processed, haveDb }) {
  if (!haveDb) {
    return {
      state: "unproven",
      headline: "not checked — no platform credentials in this job",
      detail:
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY were not supplied, so the platform's " +
        "`webhook_events` ledger was never read. Stripe's side says " +
        `${sent.length} async event(s) exist. Whether they reached us is UNKNOWN — which is not ` +
        "the same as knowing they did not, and must not be reported as either a pass or a fault.",
    };
  }

  if (sent.length === 0) {
    return {
      state: "unproven",
      headline: "nothing to have arrived yet",
      detail:
        "Stripe has generated no checkout.session.async_payment_* event on this account, so the " +
        "platform having processed none proves nothing about the destination. These events only " +
        "exist for a Checkout Session somebody COMPLETED IN A BROWSER — no script can complete " +
        "one. Click through a single SEPA switch link in test mode and run this again.",
    };
  }

  if (processed.length === 0) {
    return {
      state: "fail",
      headline: NOT_SUBSCRIBED,
      detail:
        `Stripe generated ${sent.length} async event(s) — ${sent.slice(0, 5).join(", ")} — and the ` +
        "platform's webhook_events ledger has processed NONE of them. A SEPA member would " +
        "complete their link, pay days later, and we would never hear it: they stay " +
        "switch_pending, already out of the Santander run, and nobody collects from them.",
    };
  }

  return {
    state: "pass",
    headline: "async events are reaching the destination",
    detail:
      `Stripe generated ${sent.length}; the platform processed ${processed.length} of them ` +
      `(${processed.slice(0, 5).join(", ")}).`,
  };
}

/** The webhook's ledger, over PostgREST. Returns the event ids it has accepted. */
export async function readProcessed(fetchImpl, { url, key, types = ASYNC_EVENT_TYPES }) {
  const query =
    `${url.replace(/\/$/, "")}/rest/v1/webhook_events` +
    `?select=event_id,event_type,processed_at` +
    `&event_type=in.(${types.join(",")})` +
    `&order=processed_at.desc&limit=100`;
  const res = await fetchImpl(query, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`webhook_events read failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return await res.json();
}

/** What Stripe itself says it generated. */
export async function readSent(api, { types = ASYNC_EVENT_TYPES } = {}) {
  const params = types.map((t, i) => `types[${i}]=${encodeURIComponent(t)}`).join("&");
  const list = await api("GET", `/v1/events?${params}&limit=100`);
  return list?.data ?? [];
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
// Not `import.meta.main` — that is Deno, and this repo's edge functions are Deno while its
// scripts are Node, so the two get confused easily (see scripts/ci/require-secrets.mjs).
const invokedDirectly = process.argv[1]?.endsWith("platform-check.mjs");

if (invokedDirectly) {
  const { appendFileSync } = await import("node:fs");
  const { formEncode } = await import("./rehearsal.mjs");
  void formEncode; // same module, same key handling; imported so a broken sibling fails loudly

  const key = process.env.STRIPE_TEST_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    console.error("REFUSING: STRIPE_TEST_KEY must be a TEST key (sk_test_...).");
    process.exit(1);
  }

  const api = async (method, path) => {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json?.error?.message ?? res.status}`);
    return json;
  };

  const url = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const haveDb = Boolean(url && serviceKey);

  const sentEvents = await readSent(api);
  const sent = sentEvents.map((e) => e.id);

  let processed = [];
  let readError = null;
  if (haveDb) {
    try {
      processed = (await readProcessed(fetch, { url, key: serviceKey })).map((r) => r.event_id);
    } catch (error) {
      readError = error.message;
    }
  }

  const result = readError
    ? {
        state: "unproven",
        headline: "the platform's ledger could not be read",
        detail: `${readError}. Stripe's side says ${sent.length} async event(s) exist.`,
      }
    : verdict({ sent, processed, haveDb });

  const MARK = { pass: "PASS", fail: "FAIL", unproven: "UNPROVEN" };
  console.log(`${MARK[result.state]}  async events reaching our destination`);
  console.log(`      ${result.headline}`);
  console.log(`      ${result.detail}`);
  if (sent.length) console.log(`      stripe events: ${sent.slice(0, 10).join(" ")}`);
  if (processed.length) console.log(`      processed:     ${processed.slice(0, 10).join(" ")}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (t) => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Did the async events reach our destination?",
        "",
        "| | question | answer |",
        "|---|---|---|",
        `| ${MARK[result.state]} | ${cell(result.headline)} | ${cell(result.detail)} |`,
        "",
        `Stripe generated **${sent.length}**; platform processed **${processed.length}**` +
          (haveDb ? "" : " _(ledger not read — no platform credentials in this job)_"),
        "",
      ].join("\n"),
    );
  }

  /*
    EXIT CODE — and why UNPROVEN is treated differently from FAIL here, which is a weakening and
    is written down as one rather than slipped in.

    FAIL always reds the job: Stripe sent async events and we processed none is a live fault with
    a silent, expensive consequence, and it is exactly what this check exists to catch.

    UNPROVEN reds the job only under `--strict`. The default is lenient because the ordinary,
    expected state of this check — nobody has completed a SEPA Checkout Session in test mode yet,
    so there is nothing to have arrived — would otherwise make every single run red. A job that is
    red every time it runs teaches everybody to stop reading it, and this is the one question on
    Lee's list whose wrong answer is completely silent in production. A check nobody reads is
    worth less than a check that says UNPROVEN in the summary in bold.

    What is NOT softened: the summary and the log both print UNPROVEN, never PASS, and the words
    say the question was not answered. Nothing here can report success for work it did not do.
  */
  const strict = process.argv.includes("--strict");
  if (result.state === "fail") process.exit(1);
  if (result.state === "unproven" && strict) process.exit(1);
  process.exit(0);
}
