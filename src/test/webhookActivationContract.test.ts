/**
 * Golden rule 4: "A member is activated by the payment webhook, never by client-side code or
 * onboarding forms." CLAUDE.md lists **webhook contract tests** as a CI quality gate.
 *
 * STATE.md recorded the gap plainly: *"No test imports handleSuccessfulPayment/constructEvent/
 * either webhook. ZERO tests assert a webhook activates a member."* The single rule the whole
 * payment design rests on had nothing holding it in place.
 *
 * These drive the REAL `handleSuccessfulPayment` from `_shared/post-payment.ts` — the function
 * both stripe-webhook and mollie-webhook call — against a recording Supabase double, and
 * assert what it did to the database. Not a regex over the source: the writes themselves.
 *
 * This file adds tests only. It does not touch `stripe-webhook` or `create-checkout`, which
 * stay untouched per the brief — a broken webhook means no member ever activates, and it fails
 * silently.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// The transport is not under test and pulls Deno-only specifiers, so it is stubbed at the
// module boundary. Its FAILURE is under test, though — see "email failure" below.
const sendEmail = vi.fn(async () => ({ success: true }));
vi.mock("../../supabase/functions/_shared/email.ts", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
}));
vi.mock("../../supabase/functions/_shared/welcome-email.ts", () => ({
  buildMemberWelcomeEmail: () => "<p>welcome</p>",
  memberWelcomeSubject: () => "Welcome",
}));

// The function reads Deno.env for the notify-admin call. Left undefined it throws a
// ReferenceError on every run — which the function catches, so the tests pass, but a real
// error would then be indistinguishable from the expected noise. Stubbed so the admin-notify
// path is exercised as it actually behaves rather than as an accident.
const adminNotifyCalls: string[] = [];
(globalThis as { Deno?: unknown }).Deno = {
  env: { get: (k: string) => (k === "SUPABASE_URL" ? "http://stub" : "stub-key") },
};
vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  adminNotifyCalls.push(String(url));
  return { ok: true, json: async () => ({}) } as unknown as Response;
}));

// Imported through a NON-LITERAL specifier on purpose. With a literal, `tsc -p
// tsconfig.app.json` follows the import and starts typechecking the edge-function tree — which
// is Deno code, legitimately using `Deno.env` and `npm:` specifiers, and produces 15 errors
// that say nothing about this test. Vitest still resolves it at runtime; TypeScript does not
// walk into a runtime-computed path. The shape is asserted by the assertions below.
const POST_PAYMENT = "../../supabase/functions/_shared/post-payment.ts";
const { handleSuccessfulPayment } = (await import(/* @vite-ignore */ POST_PAYMENT)) as {
  handleSuccessfulPayment: (client: unknown, params: Record<string, unknown>) => Promise<void>;
};

type Write = { table: string; op: "update" | "insert"; payload: Record<string, unknown>;
               filters: [string, unknown][] };

/**
 * A recording Supabase double. It is deliberately dumb: it records every write with the
 * filters that were attached, and answers reads from a script. The assertions are then about
 * what the function DID, which is the only thing a contract test can honestly claim.
 */
function makeSupabase(reads: Record<string, unknown> = {}) {
  const writes: Write[] = [];
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const chain: Record<string, unknown> = {
        update(payload: Record<string, unknown>) {
          writes.push({ table, op: "update", payload, filters });
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          writes.push({ table, op: "insert", payload, filters });
          return chain;
        },
        select: () => chain,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        is: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        limit: () => chain,
        order: () => chain,
        single: async () => (reads[table] ?? { data: null, error: null }),
        maybeSingle: async () => (reads[table] ?? { data: null, error: null }),
        then: undefined,
      };
      // `await supabase.from(x).select(...).eq(...)` with no .single() resolves the chain
      // itself, so it has to be thenable.
      (chain as { then?: unknown }).then = (res: (v: unknown) => unknown) =>
        res(reads[table] ?? { data: null, error: null });
      return chain;
    },
  };
  return { client, writes };
}

const PARAMS = {
  orderId: "order-1",
  paymentId: "payment-1",
  memberId: "member-1",
  amountPaid: 121,
  gatewayPaymentId: "pi_test_123",
  gateway: "stripe" as const,
};

const updatesTo = (writes: Write[], table: string) =>
  writes.filter((w) => w.table === table && w.op === "update");

describe("golden rule 4 — the payment webhook activates the member", () => {
  beforeEach(() => { sendEmail.mockClear(); adminNotifyCalls.length = 0; });

  it("SETS members.status = 'active' — the one write the whole payment design rests on", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);

    const activation = updatesTo(writes, "members").find(
      (w) => w.payload.status === "active"
    );
    expect(activation, "no write set members.status = active").toBeTruthy();
    expect(activation!.filters).toContainEqual(["id", "member-1"]);
  });

  it("activates THAT member and nobody else — the write is filtered by id", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);

    for (const w of updatesTo(writes, "members")) {
      expect(
        w.filters.some(([c]) => c === "id"),
        "an unfiltered UPDATE on members would activate every member in the table"
      ).toBe(true);
    }
  });

  it("confirms the order and completes the payment", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);

    expect(updatesTo(writes, "orders").map((w) => w.payload.status)).toContain("confirmed");

    const payment = updatesTo(writes, "payments")[0];
    expect(payment.payload.status).toBe("completed");
    expect(payment.payload.paid_at).toBeTruthy();
    expect(payment.filters).toContainEqual(["id", "payment-1"]);
  });

  it("records the gateway's own payment id under the RIGHT column per gateway", async () => {
    const stripe = makeSupabase();
    await handleSuccessfulPayment(stripe.client as never, PARAMS);
    expect(updatesTo(stripe.writes, "payments")[0].payload.stripe_payment_id).toBe("pi_test_123");
    expect(updatesTo(stripe.writes, "payments")[0].payload.mollie_payment_id).toBeUndefined();

    const mollie = makeSupabase();
    await handleSuccessfulPayment(mollie.client as never, {
      ...PARAMS, gateway: "mollie", gatewayPaymentId: "tr_test_456",
    });
    expect(updatesTo(mollie.writes, "payments")[0].payload.mollie_payment_id).toBe("tr_test_456");
    expect(updatesTo(mollie.writes, "payments")[0].payload.stripe_payment_id).toBeUndefined();
  });

  it("activates a partner-plan second member when one is supplied", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, { ...PARAMS, partnerMemberId: "member-2" });

    const ids = updatesTo(writes, "members")
      .filter((w) => w.payload.status === "active")
      .flatMap((w) => w.filters.filter(([c]) => c === "id").map(([, v]) => v));
    expect(ids).toContain("member-1");
    expect(ids).toContain("member-2");
  });

  it("does NOT activate a second member when none is supplied", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);
    expect(updatesTo(writes, "members").filter((w) => w.payload.status === "active")).toHaveLength(1);
  });
});

describe("device allocation — paid → allocated, and its failure mode", () => {
  const withPendantAndStock = () =>
    makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });

  it("allocates a free EV-07B to the member and reserves it against the order", async () => {
    const { client, writes } = withPendantAndStock();
    await handleSuccessfulPayment(client, PARAMS);

    const alloc = updatesTo(writes, "devices").find((w) => w.payload.status === "allocated");
    expect(alloc, "no device was allocated").toBeTruthy();
    expect(alloc!.payload.member_id).toBe("member-1");
    expect(alloc!.payload.reserved_order_id).toBe("order-1");
    expect(alloc!.payload.assigned_at).toBeTruthy();
  });

  it("guards the allocation with status='in_stock' so two orders cannot take one device", async () => {
    const { client, writes } = withPendantAndStock();
    await handleSuccessfulPayment(client, PARAMS);

    const alloc = updatesTo(writes, "devices").find((w) => w.payload.status === "allocated")!;
    expect(
      alloc.filters,
      "without this the same pendant can be handed to two members concurrently"
    ).toContainEqual(["status", "in_stock"]);
  });

  it("links the allocated device back to the order item", async () => {
    const { client, writes } = withPendantAndStock();
    await handleSuccessfulPayment(client, PARAMS);

    const link = updatesTo(writes, "order_items").find((w) => w.payload.device_id === "device-1");
    expect(link).toBeTruthy();
    expect(link!.filters).toContainEqual(["id", "item-1"]);
  });

  it("sets the order to awaiting_stock when no pendant is free — the visible failure", async () => {
    // FULFILMENT_MODEL.md §1-B: this is the state a human has to act on, and it went
    // unrepresented in the admin UI for months. It must at least be written.
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: null, error: { message: "no rows" } },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(updatesTo(writes, "orders").map((w) => w.payload.status)).toContain("awaiting_stock");
  });

  it("STILL activates the member when no device is free — protection is not gated on stock", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: null, error: { message: "no rows" } },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(
      updatesTo(writes, "members").some((w) => w.payload.status === "active"),
      "a paid member who cannot be shipped today is still a paid member"
    ).toBe(true);
  });

  it("does not re-allocate an order item that already has a device", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: "device-existing" }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(updatesTo(writes, "devices").filter((w) => w.payload.status === "allocated")).toHaveLength(0);
  });
});

describe("the sale is announced to a human", () => {
  it("notifies admin, so a paid member is not something only the database knows", async () => {
    adminNotifyCalls.length = 0;
    const { client } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);
    expect(adminNotifyCalls.some((u) => u.includes("/functions/v1/notify-admin"))).toBe(true);
  });
});

describe("the activation must not be lost to a downstream failure", () => {
  it("a failing welcome email does not throw — the member stays activated", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const { client, writes } = makeSupabase();

    await expect(handleSuccessfulPayment(client, PARAMS)).resolves.not.toThrow();
    expect(updatesTo(writes, "members").some((w) => w.payload.status === "active")).toBe(true);
  });

  it("activation happens BEFORE allocation and the emails, so nothing downstream can lose it", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    await handleSuccessfulPayment(client, PARAMS);

    const activationAt = writes.findIndex(
      (w) => w.table === "members" && w.payload.status === "active"
    );
    const allocationAt = writes.findIndex(
      (w) => w.table === "devices" && w.payload.status === "allocated"
    );
    expect(activationAt).toBeGreaterThanOrEqual(0);
    expect(allocationAt).toBeGreaterThan(activationAt);
  });
});

// ── the negative: golden rule 4 says NEVER from client code ────────────────
describe("nothing in the client activates a member", () => {
  it("no file under src/ writes members.status = 'active'", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
        if (full.includes(`${sep}test${sep}`)) continue;
        const src = readFileSync(full, "utf8");
        // `.from("members")` … `status: "active"` in the same statement-ish window.
        if (/from\(\s*["']members["']\s*\)[\s\S]{0,400}?status:\s*["']active["']/.test(src)) {
          offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(
      offenders,
      `golden rule 4: only the payment webhook may activate a member. Offenders: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
