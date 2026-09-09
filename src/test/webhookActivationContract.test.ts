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
        // `gt` and `in` arrived with item 6: the second-stage token lookup asks for an unused,
        // unexpired token, and without them the chain threw and the failure looked like a
        // rejected promise rather than a missing double method.
        gt: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        in: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
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

/**
 * `fulfilment_state` is the PHYSICAL sequence (20260908120400). It starts at
 * `awaiting_payment` because an order exists from the moment the wizard is submitted — before
 * anybody has paid — and NOTHING was moving it afterwards. Every paid order therefore still
 * read "awaiting payment" on the fulfilment board, so no pendant was ever picked from it.
 */
describe("fulfilment_state — the paid order reaches the fulfilment board", () => {
  it("moves awaiting_payment → paid, with the reason the trigger demands", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, PARAMS);

    const paid = updatesTo(writes, "orders").find((w) => w.payload.fulfilment_state === "paid");
    expect(paid, "the order never left awaiting_payment").toBeTruthy();
    expect(paid!.filters).toContainEqual(["id", "order-1"]);

    // Moving INTO `paid` is privileged and needs a NEW reason distinct from the old one, or
    // enforce_fulfilment_state() raises and the whole update is refused.
    expect(paid!.payload.fulfilment_state_reason).toEqual(expect.stringContaining("pi_test_123"));
    expect(paid!.payload.fulfilment_state_reason).toEqual(expect.stringContaining("stripe"));
  });

  it("names the gateway that actually paid, so the claim is auditable", async () => {
    const { client, writes } = makeSupabase();
    await handleSuccessfulPayment(client, {
      ...PARAMS,
      gateway: "mollie",
      gatewayPaymentId: "tr_test_456",
    });

    const paid = updatesTo(writes, "orders").find((w) => w.payload.fulfilment_state === "paid")!;
    expect(paid.payload.fulfilment_state_reason).toEqual(expect.stringContaining("mollie"));
    expect(paid.payload.fulfilment_state_reason).toEqual(expect.stringContaining("tr_test_456"));
  });

  it("moves paid → allocated once every pendant on the order has a device", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    await handleSuccessfulPayment(client, PARAMS);

    const allocated = updatesTo(writes, "orders").find(
      (w) => w.payload.fulfilment_state === "allocated",
    );
    expect(allocated, "a device was allocated but the board still says paid").toBeTruthy();
    // Guarded on the current state, so a re-delivered webhook cannot drag a dispatched order
    // back to `allocated`.
    expect(allocated!.filters).toContainEqual(["fulfilment_state", "paid"]);
  });

  it("does NOT claim allocated when stock ran out — the shortfall stays visible", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: null, error: { message: "no rows" } },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(
      updatesTo(writes, "orders").some((w) => w.payload.fulfilment_state === "allocated"),
      "claiming `allocated` with no device hides the one case that needs a human",
    ).toBe(false);
    expect(updatesTo(writes, "orders").map((w) => w.payload.status)).toContain("awaiting_stock");
  });

  it("does NOT claim allocated for a couple when only one of two pendants was found", async () => {
    // One order item for TWO pendants, and only one device in stock. Everything is the real
    // double except the SECOND `devices` lookup, which finds nothing — so exactly one of the
    // two pendants is really allocated.
    //
    // Only `devices` is intercepted, and only after the first pick, so every other call
    // (including the `devices` and `order_items` UPDATEs) still goes through the recording
    // double. An override that swallowed those would make the allocation throw, and the
    // assertion below would then pass because nothing ran at all.
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 2, device_id: null }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    const realFrom = client.from.bind(client);
    const alreadyAllocated = () =>
      writes.some((w) => w.table === "devices" && w.payload.status === "allocated");

    // Keyed on STATE, not on a call count: `from("devices")` is called for the SELECT and
    // again for the UPDATE, so counting calls intercepted the update and made the whole
    // allocation throw.
    (client as { from: unknown }).from = (table: string) => {
      const chain = realFrom(table) as Record<string, unknown>;
      if (table !== "devices") return chain as never;
      return {
        ...chain,
        select: () => {
          const picking: Record<string, unknown> = {
            eq: () => picking,
            is: () => picking,
            limit: () => picking,
            single: async () =>
              alreadyAllocated()
                ? { data: null, error: { message: "no rows" } }
                : { data: { id: "device-1" }, error: null },
          };
          return picking;
        },
      } as never;
    };

    await handleSuccessfulPayment(client, PARAMS);

    // Proof the run got far enough to matter: the first pendant WAS allocated.
    expect(updatesTo(writes, "devices").filter((w) => w.payload.status === "allocated")).toHaveLength(1);

    expect(
      updatesTo(writes, "orders").some((w) => w.payload.fulfilment_state === "allocated"),
      "a couple with one pendant in the box is not allocated",
    ).toBe(false);
  });

  it("leaves an order with no pendant at `paid` — there is nothing to allocate", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [], error: null },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(updatesTo(writes, "orders").some((w) => w.payload.fulfilment_state === "paid")).toBe(true);
    expect(
      updatesTo(writes, "orders").some((w) => w.payload.fulfilment_state === "allocated"),
      "no device exists to allocate, so `allocated` would be a false claim",
    ).toBe(false);
  });

  it("counts an already-allocated item as served, so a retry does not read as short of stock", async () => {
    const { client, writes } = makeSupabase({
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: "device-existing" }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    await handleSuccessfulPayment(client, PARAMS);

    expect(updatesTo(writes, "orders").some((w) => w.payload.fulfilment_state === "allocated")).toBe(
      true,
    );
  });
});

/**
 * Item 6, driven rather than described.
 *
 * The wizard no longer collects emergency contacts — they moved to a post-payment second stage
 * — and until item 6 NOTHING on the payment path minted the token that stage needs, so a member
 * who paid had no contacts at all and an operator answering their SOS had nobody to ring
 * (REVIEW_JOIN_PATH.md F6). Nothing created an auth user either, so "sign in to your dashboard"
 * named an account that did not exist.
 *
 * ORDER IS ASSERTED FROM THE RECORDED WRITES, not from positions in the source. The source-text
 * version of these assertions survived a mutation, because moving code does not necessarily
 * move the strings a regex is looking for.
 */
describe("the second stage is set up by the payment path", () => {
  const withAuth = (client: Record<string, unknown>) => {
    (client as { auth?: unknown }).auth = {
      admin: {
        generateLink: async () => ({
          data: { user: { id: "user-1" }, properties: { action_link: "https://magic" } },
        }),
      },
    };
    return client;
  };

  const readsFor = (memberIds: string[]) => ({
    members: { data: { id: memberIds[0], first_name: "Ana", last_name: "Ruiz", email: "ana@example.com", preferred_language: "es", user_id: null }, error: null },
  });

  it("mints a second-stage token for the member", async () => {
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    await handleSuccessfulPayment(withAuth(client as never) as never, PARAMS);

    const token = writes.find((w) => w.table === "member_update_tokens" && w.op === "insert");
    expect(token, "no second-stage token was minted — the member has no way to give us contacts").toBeTruthy();
    expect(token!.payload.member_id).toBe("member-1");
    expect(token!.payload.issued_via).toBe("post_payment");
    expect(token!.payload.created_by).toBeNull();
  });

  it("mints ONE PER MEMBER for a couple — two data subjects, two tokens", async () => {
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    await handleSuccessfulPayment(withAuth(client as never) as never, {
      ...PARAMS,
      partnerMemberId: "member-2",
    });

    const tokens = writes.filter((w) => w.table === "member_update_tokens" && w.op === "insert");
    expect(tokens).toHaveLength(2);
  });

  it("points members.user_id at the auth user it created", async () => {
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    await handleSuccessfulPayment(withAuth(client as never) as never, PARAMS);

    // Without this write every member-facing RLS policy matches nothing, so the member signs
    // in and sees an empty dashboard.
    const link = writes.find((w) => w.table === "members" && w.payload.user_id === "user-1");
    expect(link, "the auth user was never linked to the member row").toBeTruthy();
  });

  it("ACTIVATES first, then onboards — activation must not be lost to either step", async () => {
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    await handleSuccessfulPayment(withAuth(client as never) as never, PARAMS);

    const activation = writes.findIndex((w) => w.table === "members" && w.payload.status === "active");
    const token = writes.findIndex((w) => w.table === "member_update_tokens");
    expect(activation).toBeGreaterThanOrEqual(0);
    expect(token).toBeGreaterThan(activation);
  });

  it("onboards BEFORE allocating a device — the token is the safety-relevant one", async () => {
    const { client, writes } = makeSupabase({
      ...readsFor(["member-1"]),
      order_items: { data: [{ id: "item-1", quantity: 1, device_id: null }], error: null },
      devices: { data: { id: "device-1" }, error: null },
    });
    await handleSuccessfulPayment(withAuth(client as never) as never, PARAMS);

    const token = writes.findIndex((w) => w.table === "member_update_tokens");
    const allocation = writes.findIndex((w) => w.table === "devices");
    expect(token).toBeGreaterThanOrEqual(0);
    expect(allocation).toBeGreaterThan(token);
  });

  it("still activates the member when the login could not be created", async () => {
    // The payment path must never lose an activation to a downstream failure, and an auth
    // service that is down is exactly that.
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    (client as { auth?: unknown }).auth = {
      admin: { generateLink: async () => { throw new Error("auth down"); } },
    };

    await expect(handleSuccessfulPayment(client as never, PARAMS)).resolves.not.toThrow();
    expect(writes.some((w) => w.table === "members" && w.payload.status === "active")).toBe(true);
  });

  it("still activates the member when the token could not be minted", async () => {
    const { client, writes } = makeSupabase(readsFor(["member-1"]));
    withAuth(client as never);
    const realFrom = client.from.bind(client);
    (client as { from: unknown }).from = (table: string) => {
      if (table === "member_update_tokens") {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain, is: () => chain, gt: () => chain,
          order: () => chain, limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ error: { message: "rls denied" } }),
        };
        return chain as never;
      }
      return realFrom(table);
    };

    await expect(handleSuccessfulPayment(client as never, PARAMS)).resolves.not.toThrow();
    expect(writes.some((w) => w.table === "members" && w.payload.status === "active")).toBe(true);
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
