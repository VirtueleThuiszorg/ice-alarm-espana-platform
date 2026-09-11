/**
 * stripe-webhook contract tests — item 5b.
 *
 * The webhook is the ONLY thing allowed to activate a member (golden rule 4), and CLAUDE.md
 * lists webhook contract tests as a CI gate. Its body runs inside `serve()`, so the decisions
 * were extracted into `_shared/stripe-events.ts` and the admin notification into
 * `_shared/staff-bell.ts` precisely so they could be driven here rather than described in a
 * comment.
 *
 * Every case below is a defect the platform actually had:
 *
 *   the event recorded before it was processed → a failed run became a permanent "duplicate"
 *   `checkout.session.completed` treated as paid → SEPA members active before the money moved
 *   nothing comparing amount_total to payments.amount → REVIEW_JOIN_PATH.md F9
 *   subscriptions activated by member_id → a cancelled subscription resurrected
 *   `statusMap[s] || s` → Stripe's own strings written into a Postgres enum, failing silently
 *   `invoice.paid` on the signup invoice → every signup counted twice in revenue
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */
const EVENTS_MOD = "../../supabase/functions/_shared/stripe-events.ts";
const BELL_MOD = "../../supabase/functions/_shared/staff-bell.ts";

const {
  checkAmount,
  isFirstInvoice,
  isSessionPaid,
  mapSubscriptionStatus,
  missingEventFields,
  renewalDateFrom,
  REQUIRED_EVENT_FIELDS,
  AMOUNT_TOLERANCE_CENTS,
} = (await import(/* @vite-ignore */ EVENTS_MOD)) as any;
const { notifyAdmins } = (await import(/* @vite-ignore */ BELL_MOD)) as any;

/** Source with comments stripped — the assertions are about code, and the header names the
 * very strings ("mode: payment", `member_id`) the old code used. */
function code(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const WEBHOOK = code("supabase/functions/stripe-webhook/index.ts");

/**
 * Where the post-payment handler is CALLED.
 *
 * `indexOf("handleSuccessfulPayment")` finds the import at the top of the file, which is
 * before everything — so an ordering assertion written against it passes no matter what the
 * code does, and a slice ending at it is empty. Both of those went unnoticed until these
 * tests first ran.
 */
const POST_PAYMENT_CALL = WEBHOOK.indexOf("await handleSuccessfulPayment(");

describe("checkout.session.completed does not mean paid", () => {
  it("only 'paid' counts", () => {
    expect(isSessionPaid("paid")).toBe(true);
    // SEPA Direct Debit — half of what this business sells on — completes the session and
    // moves the money days later, or not at all.
    expect(isSessionPaid("unpaid")).toBe(false);
    expect(isSessionPaid("no_payment_required")).toBe(false);
    expect(isSessionPaid(null)).toBe(false);
    expect(isSessionPaid(undefined)).toBe(false);
  });

  it("the async success event is handled, or SEPA never activates at all", () => {
    // Refusing `unpaid` is only safe because the later event is handled too. Without it, every
    // SEPA customer pays and is never activated.
    expect(WEBHOOK).toContain("checkout.session.async_payment_succeeded");
    expect(REQUIRED_EVENT_FIELDS["checkout.session.async_payment_succeeded"]).toBeTruthy();
  });

  it("the function checks payment_status before activating", () => {
    expect(WEBHOOK).toMatch(/isSessionPaid\(session\.payment_status\)/);
  });
});

describe("the money must match what we recorded as due (F9)", () => {
  it("agrees when Stripe's cents equal our euros", () => {
    expect(checkAmount(12100, 121).agrees).toBe(true);
    expect(checkAmount(6285, 62.85).agrees).toBe(true);
  });

  it("refuses a cent more or less — there is no tolerance on money", () => {
    expect(AMOUNT_TOLERANCE_CENTS).toBe(0);
    expect(checkAmount(12101, 121).agrees).toBe(false);
    expect(checkAmount(12099, 121).agrees).toBe(false);
  });

  it("refuses the one-cent membership — the exact F7+F9 exploit", () => {
    const check = checkAmount(1, 121);
    expect(check.agrees).toBe(false);
    expect(check.chargedCents).toBe(1);
    expect(check.expectedCents).toBe(12100);
  });

  it("refuses when we recorded no amount at all, rather than treating 0 as agreement", () => {
    // 0 === 0 would otherwise "agree", activating a member against a payment row that was
    // never priced.
    expect(checkAmount(0, 0).agrees).toBe(false);
    expect(checkAmount(0, null).agrees).toBe(false);
    expect(checkAmount(null, 0).agrees).toBe(false);
  });

  it("does not confuse euros with cents", () => {
    // Reading `amount_total` as euros would make 12100 look like 12100 €, and a units mistake
    // that reads as equal is the failure this comparison exists to catch.
    expect(checkAmount(121, 121).agrees).toBe(false);
  });

  it("the function refuses activation on a mismatch and tells a human", () => {
    const branch = WEBHOOK.slice(WEBHOOK.indexOf("if (!amounts.agrees)"));
    expect(branch).toContain("AMOUNT_MISMATCH");
    expect(branch).toContain("notifyAdmins");
    expect(branch).toMatch(/activated:\s*false/);
    // The refusal must come BEFORE any activation.
    expect(WEBHOOK.indexOf("if (!amounts.agrees)")).toBeLessThan(
      POST_PAYMENT_CALL,
    );
  });

  it("compares against payments.amount, which create-checkout wrote server-side", () => {
    expect(WEBHOOK).toMatch(/checkAmount\(session\.amount_total, payment\.amount/);
    expect(code("supabase/functions/create-checkout/index.ts")).toMatch(
      /amount:\s*Number\(\(resolved\.totalCents \/ 100\)/,
    );
  });
});

describe("subscriptions are activated BY ID", () => {
  it("no write to subscriptions is filtered by member_id", () => {
    // `.eq("member_id", memberId)` set EVERY subscription that member had ever had to active
    // and stamped this Stripe id on all of them — including a cancelled one, resurrected.
    const activation = WEBHOOK.slice(
      WEBHOOK.indexOf("const stripeFields"),
      POST_PAYMENT_CALL,
    );
    expect(activation).not.toMatch(/\.eq\("member_id"/);
    expect(activation).toMatch(/\.eq\("id", id\)/);
  });

  it("sets the Stripe ids, active, and registration_fee_paid", () => {
    const fields = WEBHOOK.slice(
      WEBHOOK.indexOf("const stripeFields"),
      WEBHOOK.indexOf("const subscriptionIds"),
    );
    for (const key of [
      "stripe_subscription_id",
      "stripe_customer_id",
      "registration_fee_paid",
    ]) {
      expect(fields, key).toContain(key);
    }
    expect(fields).toMatch(/status:\s*"active"/);
  });

  it("activates both halves of a couple against ONE Stripe subscription", () => {
    const block = WEBHOOK.slice(WEBHOOK.indexOf("const subscriptionIds"));
    expect(block).toMatch(/partnerSubscriptionId/);
    // Same `stripeFields` for both, which is what "one household subscription" means.
    expect(block).toMatch(/for \(const id of subscriptionIds\)/);
  });

  it("checks the error and the matched count on every activation", () => {
    const block = WEBHOOK.slice(
      WEBHOOK.indexOf("for (const id of subscriptionIds)"),
      POST_PAYMENT_CALL,
    );
    expect(block).toContain("if (error)");
    expect(block).toMatch(/updated\.length === 0/);
  });
});

describe("Stripe statuses we have no enum for are skipped, not written", () => {
  it("maps the five we support", () => {
    expect(mapSubscriptionStatus("active")).toBe("active");
    expect(mapSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapSubscriptionStatus("canceled")).toBe("cancelled");
    expect(mapSubscriptionStatus("unpaid")).toBe("suspended");
    expect(mapSubscriptionStatus("paused")).toBe("paused");
  });

  it("returns null for real Stripe statuses that are not subscription_status values", () => {
    // `statusMap[s] || s` wrote these into a Postgres enum. The UPDATE failed, the error was
    // discarded, and the webhook answered 200.
    for (const status of ["incomplete", "incomplete_expired", "trialing"]) {
      expect(mapSubscriptionStatus(status), status).toBeNull();
    }
  });

  it("the function skips the write when there is no mapping", () => {
    expect(WEBHOOK).toMatch(/if \(!status\)/);
    expect(WEBHOOK).not.toMatch(/statusMap\[[^\]]+\]\s*\|\|/);
  });
});

describe("a cancellation is announced to a human", () => {
  const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onSubscriptionChange"));

  it("notifies the admins when a subscription is deleted at Stripe", () => {
    // WIRING_REGISTER absence row A3: the webhook set `status = 'cancelled'` and returned, while
    // `isabella_settings` carried a `cancellation_alert` switch promising the opposite. The only
    // surface it reached was a badge on a page somebody had to already be looking at — and a
    // cancellation is the single most important number in this business.
    expect(handler).toContain("notifyAdmins");
    expect(handler).toMatch(/entityType:\s*"subscription"/);
  });

  it("does NOT notify on every subscription.updated", () => {
    // Stripe sends `updated` for routine things — a price change, a payment-method swap, a
    // period rolling over. An admin who gets a bell for each stops reading them, which is how a
    // real cancellation gets missed.
    expect(handler).toMatch(/if \(event\.type === "customer\.subscription\.deleted"\) \{/);
    const notifyAt = handler.indexOf("notifyAdmins");
    const guardAt = handler.indexOf('if (event.type === "customer.subscription.deleted")');
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(notifyAt);
  });

  it("still records the cancellation even when nobody could be told", () => {
    // The status write happens before the bell, so a notification failure cannot cost us the
    // fact that the subscription is cancelled.
    expect(handler.indexOf('.update({ status })')).toBeLessThan(handler.indexOf("notifyAdmins"));
  });
});

describe("the signup invoice is not a renewal", () => {
  it("recognises Stripe's billing_reason", () => {
    expect(isFirstInvoice("subscription_create")).toBe(true);
    expect(isFirstInvoice("subscription_cycle")).toBe(false);
    expect(isFirstInvoice("subscription_update")).toBe(false);
    expect(isFirstInvoice(null)).toBe(false);
    expect(isFirstInvoice(undefined)).toBe(false);
  });

  it("invoice.paid skips it, so one charge is not recorded twice", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onInvoicePaid"));
    expect(handler).toMatch(/isFirstInvoice\(invoice\.billing_reason\)/);
    expect(handler.indexOf("isFirstInvoice")).toBeLessThan(handler.indexOf('from("payments")'));
  });
});

describe("a paid renewal moves the renewal date", () => {
  it("prefers Stripe's own period end", () => {
    // 2027-01-15T00:00:00Z
    const invoice = { lines: { data: [{ period: { end: 1799971200 } }] } };
    const result = renewalDateFrom(invoice, "monthly");
    expect(result.source).toBe("stripe_period_end");
    expect(result.date).toBe("2027-01-15");
  });

  it("computes one when Stripe's is missing, rather than leaving it stale", () => {
    // A renewal_date left behind makes a paying member read as overdue on every screen that
    // compares it to today, so doing nothing is worse than computing.
    const now = new Date("2026-09-09T12:00:00Z");
    expect(renewalDateFrom({}, "monthly", now)).toEqual({ date: "2026-10-09", source: "computed" });
    expect(renewalDateFrom({}, "annual", now)).toEqual({ date: "2027-09-09", source: "computed" });
  });

  it("ignores a malformed period end instead of producing an invalid date", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    for (const end of [0, -1, null, "soon", undefined]) {
      const result = renewalDateFrom({ lines: { data: [{ period: { end } }] } }, "monthly", now);
      expect(result.source, String(end)).toBe("computed");
      expect(result.date).toBe("2026-10-09");
    }
  });

  it("the handler writes it, and cures past_due", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onInvoicePaid"));
    expect(handler).toMatch(/renewal_date: renewal\.date/);
    // A member who has paid must not stay on the attention queue for a bill they settled.
    expect(handler).toMatch(/status:\s*"active"/);
  });
});

describe("the API version contract is checked, not assumed", () => {
  it("names the fields that move in later Stripe versions", () => {
    // Both are top-level until 2025-03-31 ("basil"). A bumped destination makes them
    // undefined and every read fails silently.
    expect(REQUIRED_EVENT_FIELDS["invoice.paid"]).toContain("subscription");
    expect(REQUIRED_EVENT_FIELDS["invoice.payment_failed"]).toContain("subscription");
  });

  it("finds nothing missing on a well-formed 2024-06-20 session", () => {
    const session = {
      id: "cs_1",
      payment_status: "paid",
      amount_total: 12100,
      metadata: {
        order_id: "o1",
        payment_id: "p1",
        member_id: "m1",
        subscription_id: "s1",
        partner_member_id: "",
      },
    };
    expect(missingEventFields("checkout.session.completed", session)).toEqual([]);
  });

  it("treats an empty metadata string as missing", () => {
    // Stripe metadata values are strings and `checkoutMetadata()` writes "" for "no partner",
    // so a blank order_id is a real absence rather than a value.
    const session = {
      id: "cs_1",
      payment_status: "paid",
      amount_total: 12100,
      metadata: { order_id: "", payment_id: "p1", member_id: "m1", subscription_id: "s1" },
    };
    expect(missingEventFields("checkout.session.completed", session)).toEqual(["metadata.order_id"]);
  });

  it("reports every missing field, not just the first", () => {
    expect(missingEventFields("checkout.session.completed", { id: "cs_1" }).length).toBeGreaterThan(3);
  });

  it("says nothing about event types it has no contract for", () => {
    expect(missingEventFields("customer.created", {})).toEqual([]);
  });

  it("the function refuses and bells when a field is missing", () => {
    const block = WEBHOOK.slice(WEBHOOK.indexOf("const missing = missingEventFields"));
    expect(block).toContain("MISSING_FIELDS");
    expect(block).toContain("notifyAdmins");
    expect(block).toContain("2024-06-20");
  });
});

describe("idempotency: claimed on arrival, stamped on success", () => {
  it("only a STAMPED row counts as a duplicate", () => {
    // The old code inserted the row before processing, so a run that threw left a row that
    // made every Stripe retry answer "duplicate, skipping" — the money had arrived and the
    // member was never activated.
    expect(WEBHOOK).toMatch(/if \(existingEvent\?\.processed_at\)/);
  });

  it("the claim is written with processed_at explicitly null", () => {
    // The column DEFAULTS to now(), which is what made the old behaviour the default.
    expect(WEBHOOK).toMatch(/processed_at:\s*null/);
  });

  it("the stamp happens after the handler, not before", () => {
    expect(WEBHOOK.indexOf("await handleEvent(")).toBeLessThan(
      WEBHOOK.indexOf("processed_at: new Date().toISOString()"),
    );
  });

  it("an unfinished row is reprocessed rather than skipped", () => {
    expect(WEBHOOK).toContain("Re-processing a previously unfinished event");
  });

  it("a thrown handler returns 500 so Stripe retries", () => {
    const catchBlock = WEBHOOK.slice(WEBHOOK.lastIndexOf("} catch (error) {"));
    expect(catchBlock).toMatch(/json\(500/);
  });
});

describe("a failed payment never stops the monitoring (P4)", () => {
  it("invoice.payment_failed sets past_due and WRITES nothing about the member", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onInvoiceFailed"));
    expect(handler).toMatch(/status:\s*"past_due"/);
    /*
      THE RULE IS ABOUT WRITES, and this used to be asserted as `not.toMatch(/from\("members"\)/)`
      — no mention of the table at all. That was true while the handler told nobody but the
      office. It now texts the member once Stripe has given up retrying, which means READING
      their name, phone and language, and the old assertion would have forbidden a message rather
      than a status change.

      So the assertion moves to what the invariant actually is: somebody whose payment bounced is
      still somebody who may press an SOS button tonight, and nothing here may change their
      record. A read is fine; an update is the defect.
    */
    expect(handler).not.toMatch(/from\("members"\)[\s\S]{0,200}\.update\(/);
    expect(handler).not.toMatch(/from\("members"\)[\s\S]{0,200}\.delete\(/);
    expect(handler).toContain("notifyAdmins");
  });

  /*
    AND THE MEMBER IS NOT TOLD UNTIL IT IS REAL. `invoice.payment_failed` fires on every attempt;
    Stripe's smart retries clear most direct-debit failures on their own. A text on the first one
    is several hundred elderly people frightened about a problem that fixed itself — and it
    arrives from the company that holds their emergency button.
  */
  it("texts the member only once Stripe has stopped retrying", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onInvoiceFailed"));
    expect(handler).toMatch(/stage === "exhausted" && member\?\.phone/);
    expect(handler).toMatch(/failureStage\(/);
  });

  it("no handler in the whole webhook deactivates a member", () => {
    expect(WEBHOOK).not.toMatch(/status:\s*"inactive"/);
    expect(WEBHOOK).not.toMatch(/status:\s*"suspended"[\s\S]{0,80}from\("members"\)/);
  });
});

describe("payment_intent events look up by the id actually stored", () => {
  it("matches on stripe_payment_id and counts what it matched", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onPaymentIntent"));
    expect(handler).toMatch(/\.eq\("stripe_payment_id", paymentIntent\.id\)/);
    expect(handler).toContain(".select(\"id\")");
  });

  it("a FAILURE that matched nothing tells a human; a success does not", () => {
    const handler = WEBHOOK.slice(WEBHOOK.indexOf("async function onPaymentIntent"));
    const zeroBranch = handler.slice(handler.indexOf("if (count === 0)"));
    expect(zeroBranch).toContain("notifyAdmins");
    expect(zeroBranch).toContain("if (failed)");
    // The success case is ordinary: the session handler already recorded the signup charge.
    expect(zeroBranch).toContain("already recorded");
  });
});

describe("the admin bell is addressed, not broadcast", () => {
  function makeDb(staff: Array<Record<string, unknown>>, opts: { staffError?: string; insertError?: string } = {}) {
    const inserts: Array<Array<Record<string, unknown>>> = [];
    const db = {
      from(table: string) {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          insert: async (rows: Array<Record<string, unknown>>) => {
            inserts.push(rows);
            return { error: opts.insertError ? { message: opts.insertError } : null };
          },
          then: (resolve: (v: unknown) => unknown) =>
            resolve({
              data: table === "staff" ? staff : [],
              error: opts.staffError ? { message: opts.staffError } : null,
            }),
        };
        return chain;
      },
    } as any;
    return { db, inserts };
  }

  const BELL = { eventType: "system", message: "money went wrong", entityType: "order", entityId: "o1" };

  it("writes ONE row per admin, each addressed to that person", async () => {
    const { db, inserts } = makeDb([
      { user_id: "u1", role: "admin" },
      { user_id: "u2", role: "super_admin" },
    ]);
    const result = await notifyAdmins(db, BELL);

    expect(result).toEqual({ notified: 2, error: null });
    expect(inserts[0]).toHaveLength(2);
    expect(inserts[0].map((r) => r.admin_user_id)).toEqual(["u1", "u2"]);
  });

  it("never writes a null admin_user_id — that is a broadcast", async () => {
    // A broadcast row is SHARED: the first person to mark it read clears it for everyone,
    // including the admin who had not seen it. And it would put a bell in front of operators
    // that lands them on /unauthorized, because /admin is behind requireAdmin.
    const { db, inserts } = makeDb([{ user_id: "u1", role: "admin" }, { user_id: null, role: "admin" }]);
    await notifyAdmins(db, BELL);

    for (const row of inserts[0]) {
      expect(row.admin_user_id).toBeTruthy();
    }
    expect(inserts[0]).toHaveLength(1);
  });

  it("carries the entity so the notification links somewhere", async () => {
    const { db, inserts } = makeDb([{ user_id: "u1", role: "admin" }]);
    await notifyAdmins(db, BELL);

    expect(inserts[0][0]).toMatchObject({
      event_type: "system",
      message: "money went wrong",
      entity_type: "order",
      entity_id: "o1",
      status: "pending",
    });
  });

  it("reports, rather than throws, when there is nobody to tell", async () => {
    const { db, inserts } = makeDb([]);
    const result = await notifyAdmins(db, BELL);
    expect(result.notified).toBe(0);
    expect(result.error).toMatch(/no active admin/);
    expect(inserts).toHaveLength(0);
  });

  it("reports, rather than throws, when the insert fails", async () => {
    // A webhook that 500s because a bell failed is a webhook Stripe retries, and the retry
    // re-runs whatever already succeeded.
    const { db } = makeDb([{ user_id: "u1", role: "admin" }], { insertError: "rls" });
    const result = await notifyAdmins(db, BELL);
    expect(result.notified).toBe(0);
    expect(result.error).toMatch(/insert failed: rls/);
  });

  it("reports, rather than throws, when the staff lookup fails", async () => {
    const { db } = makeDb([], { staffError: "down" });
    const result = await notifyAdmins(db, BELL);
    expect(result.error).toMatch(/staff lookup failed: down/);
  });

  it("never throws even if the client itself does", async () => {
    const exploding = { from: () => { throw new Error("boom"); } } as any;
    await expect(notifyAdmins(exploding, BELL)).resolves.toEqual({
      notified: 0,
      error: "boom",
    });
  });

  it("asks only for active admins", async () => {
    const source = code("supabase/functions/_shared/staff-bell.ts");
    expect(source).toMatch(/\.eq\("is_active", true\)/);
    expect(source).toMatch(/\.in\("role", NOTIFIED_ROLES\)/);
  });

  it("notifies EXACTLY admin and super_admin, and no operator role", () => {
    // Not a loose match on the two names: appending "call_centre" would satisfy that, and it
    // is the precise mistake this design exists to avoid — /admin is behind requireAdmin, so
    // an operator following one of these notifications lands on /unauthorized.
    const source = code("supabase/functions/_shared/staff-bell.ts");
    const declaration = source.match(/const NOTIFIED_ROLES = \[([^\]]*)\]/);
    expect(declaration, "NOTIFIED_ROLES is no longer a literal array").toBeTruthy();
    const roles = declaration![1]
      .split(",")
      .map((r) => r.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    expect(roles).toEqual(["admin", "super_admin"]);
  });
});

describe("the bell leads somewhere the recipient can open", () => {
  const routing = code("src/lib/notificationLink.ts");

  it("routes the order and subscription entity types", () => {
    expect(routing).toContain('case "order"');
    expect(routing).toContain('/admin/orders');
    expect(routing).toContain('case "subscription"');
    expect(routing).toContain('/admin/subscriptions');
  });

  it("those routes exist", () => {
    const app = code("src/App.tsx");
    expect(app).toMatch(/path="orders"/);
    expect(app).toMatch(/path="subscriptions"/);
  });
});

describe("no PII in the webhook's logs", () => {
  it("logs ids, not people", () => {
    const logs = WEBHOOK.match(/console\.(log|warn|error)\([\s\S]{0,400}?\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(5);
    for (const line of logs) {
      expect(line, line.slice(0, 60)).not.toMatch(/\bemail\b|first_name|last_name|\bphone\b/i);
    }
  });
});
